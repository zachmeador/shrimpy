import assert from "node:assert/strict";
import { existsSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { createModels } from "@earendil-works/pi-ai";
import { defineExtension, type Extension } from "@earendil-works/pi-durable";
import { migrationCopy, sqliteBeside, type StoreFormat } from "../../lib/migration/node.ts";
import { eventually, stopAfter, tempDir } from "../../lib/testing/index.ts";
import { createAdmissions } from "../chat/durable.ts";
import { homePaths } from "../home/index.ts";
import { AGENT_STORAGE, openHost, type StorageVersion } from "../host/durable.ts";
import { isWakeup, type Outstanding, type TurnOutcome } from "../inputs/index.ts";
import { createSessions, requireModel, stopWork } from "../sessions/durable.ts";
import { callingTools, fauxModels, loggedRequests, type Script } from "../testing/index.ts";
import { turnTask } from "../turns/durable.ts";
import type { Delivery } from "../turns/index.ts";
import { createWakeups, WAKEUP_TASK, wakeupTools } from "./durable.ts";

/*
 * Wake-ups on the real engine, with no chat. The engine is stopped at instants
 * that a test of the whole agent can't pick.
 */

const timeout = 30_000;

type Tools = ReturnType<typeof wakeupTools>;

/** The tool, except that once it has set its wake-up it never returns, as if the agent stopped then. `set` is told when. */
function diesAfterSetting(real: Tools, set: () => void): Tools {
  return defineExtension({
    name: "wakeup-tools",
    tools: (real.tools ?? []).map((tool) => ({
      ...tool,
      async execute(args, api, context) {
        const result = await tool.execute(args, api, context);
        set();
        await new Promise<never>((_resolve, reject) => {
          context.abortSignal?.addEventListener("abort", () => reject(context.abortSignal?.reason as Error), { once: true });
        });
        return result;
      },
    })),
  });
}

interface StartOptions {
  /** Stand in for the tool the agent has. */
  tools?: (real: Tools) => Tools;
  /** Stand in for the wake-ups' own extension, as another release has it. */
  wakeups?: (real: Extension) => Extension;
  /** The format of the agent's storage, as another release has it. */
  storage?: StoreFormat<StorageVersion>;
}

/** An agent's host and sessions on `home`, with what the tasks tell their sources kept in `told`. */
async function start(t: TestContext, home: string, script: Script, options: StartOptions = {}) {
  const told: { input: Outstanding; outcome: TurnOutcome }[] = [];
  const delivery: Delivery = {
    announce: () => Promise.resolve("told"),
    tell(input, outcome) {
      told.push({ input, outcome });
      return Promise.resolve("told");
    },
  };
  const { models, model } = fauxModels({ home, script, tokensPerSecond: 4000 });
  const reports: Error[] = [];
  const turn = turnTask({ delivery, onError: (error) => reports.push(error) });
  const wakeups = createWakeups(turn.task, { onError: (error) => reports.push(error), breadcrumbs: () => Promise.resolve([]) });
  const host = await openHost({ home, models }, options.storage);
  host.install(turn.extension, (options.wakeups ?? ((real) => real))(wakeups.extension), (options.tools ?? ((real) => real))(wakeupTools({ wakeups })));
  let closing: Promise<void> | undefined;
  const stop = (): Promise<void> => (closing ??= host.close());
  stopAfter(t, stop);
  const defaults = { model, cwd: home };
  const admissions = createAdmissions(
    host.harness,
    defaults,
    turn.task,
    { stopWork, requireModel: (wanted) => requireModel(models, wanted) },
    () => Promise.resolve([]),
  );
  await createSessions(host.harness, defaults, models).applyDefaults();
  host.resume();
  return {
    told,
    reports,
    stop,
    /** The `n`th message from a person in a thread of its own, as the agent takes it up. */
    admit: (n = 1) =>
      admissions.admit({
        event: { kind: "posted", id: `evt_${String(n)}`, seq: n, author: "Zach", text: "check back soon", sentAt: Date.now() },
        threadId: "th_1",
        channelId: "ch_1",
      }),
  };
}

/** How many wake-ups the sources were told about. */
const wakeupsTold = (told: { input: Outstanding }[]): number => told.filter(({ input }) => isWakeup(input)).length;

/** How many times the model has been asked so far. */
const requests = (home: string): number => (existsSync(join(home, "requests.jsonl")) ? loggedRequests(home).length : 0);

test("a check_back that runs again after the agent stopped in it sets no second wake-up", { timeout }, async (t) => {
  const home = tempDir(t, "wakeups");
  // The first message sets a wake-up, and its wake-up is answered. The second sets one that is due after any second
  // one the first could have set, since that would be due a second after the call ran again.
  const model = callingTools([
    [{ name: "check_back", args: { in: "1s", note: "look at the build" } }],
    [],
    [{ name: "check_back", args: { in: "1s", note: "and after it" } }],
  ]);
  let set: () => void = () => undefined;
  const afterSetting = new Promise<void>((resolve) => {
    set = resolve;
  });
  const dying = await start(t, home, model.script, { tools: (real) => diesAfterSetting(real, set) });
  await dying.admit();
  await afterSetting;
  await dying.stop();

  const back = await start(t, home, model.script);

  await eventually(() => back.told, (found) => wakeupsTold(found) === 1, { what: "the wake-up to come", timeoutMs: 15_000 });
  await back.admit(2);
  const notes = (): string[] => back.told.flatMap(({ input }) => (isWakeup(input) ? [input.wakeup.note] : []));
  await eventually(notes, (found) => found.includes("and after it"), { what: "the later wake-up to come", timeoutMs: 15_000 });
  assert.deepEqual(notes(), ["look at the build", "and after it"], "a wake-up for each call, and none for the call run again");
  assert.equal(back.told.length, 4, "the two messages and their wake-ups");
  assert.equal(requests(home), 6, "the first call, the answer once it is back, the wake-up, the second call and its answer, and its wake-up");
  assert.deepEqual(back.reports, []);
});

test("a wake-up waiting through an update is taken up on the next release, whose wake-up carries a migrate, and this release then refuses the storage, naming the copy, until the copy is put back", { timeout: 60_000 }, async (t) => {
  const home = tempDir(t, "wakeups");
  const { database } = homePaths(home);
  const model = callingTools([[{ name: "check_back", args: { in: "5s", note: "look at the build" } }]]);
  const today = await start(t, home, model.script);
  await today.admit();
  await eventually(() => today.told, (found) => found.length === 1, { what: "the message to be answered" });
  await today.stop();

  // The next release's wake-up is a version on, and its migrate says in the note that the wake-up came through.
  const migrating = (real: Extension): Extension =>
    defineExtension({
      ...real,
      tasks: (real.tasks ?? []).map(({ definition }) => ({
        definition: {
          ...definition,
          version: definition.version + 1,
          migrate: (input: { wakeup: { note: string } }, checkpoint: unknown) => ({
            input: { ...input, wakeup: { ...input.wakeup, note: `${input.wakeup.note}, kept through the update` } },
            checkpoint,
          }),
        },
      })),
    });
  const [newest] = AGENT_STORAGE.steps.slice(-1);
  assert.ok(newest);
  const version = AGENT_STORAGE.current + 1;
  const storage = {
    ...AGENT_STORAGE,
    current: version,
    steps: [...AGENT_STORAGE.steps, { ...newest, version, tasks: { ...newest.tasks, [WAKEUP_TASK]: (newest.tasks[WAKEUP_TASK] ?? 0) + 1 } }],
  };
  const updated = await start(t, home, model.script, { wakeups: migrating, storage });
  await eventually(() => updated.told, (found) => wakeupsTold(found) === 1, { what: "the wake-up to come", timeoutMs: 30_000 });
  const notes = updated.told.flatMap(({ input }) => (isWakeup(input) ? [input.wakeup.note] : []));
  assert.deepEqual(notes, ["look at the build, kept through the update"]);
  assert.deepEqual(updated.reports, []);
  await updated.stop();

  const copy = migrationCopy(database);
  await assert.rejects(openHost({ home, models: createModels() }), (error: Error) => error.message.includes(copy));

  for (const beside of sqliteBeside(database)) rmSync(beside, { force: true });
  renameSync(copy, database);
  const back = await openHost({ home, models: createModels() });
  await back.close();
});
