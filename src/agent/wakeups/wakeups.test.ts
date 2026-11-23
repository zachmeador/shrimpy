import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { defineExtension } from "@earendil-works/pi-durable";
import { eventually, stopAfter, tempDir } from "../../lib/testing/index.ts";
import { createAdmissions } from "../chat/durable.ts";
import { openHost } from "../host/durable.ts";
import { isWakeup, type Outstanding, type TurnOutcome } from "../inputs/index.ts";
import { createSessions, requireModel, stopWork } from "../sessions/durable.ts";
import { callingTools, fauxModels, loggedRequests, type Script } from "../testing/index.ts";
import { turnTask } from "../turns/durable.ts";
import type { Delivery } from "../turns/index.ts";
import { createWakeups, wakeupTools } from "./durable.ts";

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
}

/** An agent's host and sessions on `home`, with what the tasks tell their sources kept in `told`. */
async function start(t: TestContext, home: string, script: Script, options: StartOptions = {}) {
  const told: { input: Outstanding; outcome: TurnOutcome }[] = [];
  const delivery: Delivery = {
    tell(input, outcome) {
      told.push({ input, outcome });
      return Promise.resolve("told");
    },
  };
  const { models, model } = fauxModels({ home, script, tokensPerSecond: 4000 });
  const reports: Error[] = [];
  const turn = turnTask({ delivery, onError: (error) => reports.push(error) });
  const wakeups = createWakeups(turn.task, { onError: (error) => reports.push(error), breadcrumbs: () => Promise.resolve([]) });
  const host = await openHost({ home, models });
  host.install(turn.extension, wakeups.extension, (options.tools ?? ((real) => real))(wakeupTools({ wakeups })));
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
