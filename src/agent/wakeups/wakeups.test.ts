import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
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
      return Promise.resolve();
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
    /** A message from a person in a thread of its own, as the agent takes it up. */
    admit: () =>
      admissions.admit({
        event: { kind: "posted", id: "evt_1", seq: 1, author: "Zach", text: "check back soon", sentAt: Date.now() },
        threadId: "th_1",
        channelId: "ch_1",
      }),
  };
}

/** How many wake-ups the sources were told about. */
const wakeupsTold = (told: { input: Outstanding }[]): number => told.filter(({ input }) => isWakeup(input)).length;

/** How many times the model has been asked so far. */
const requests = (home: string): number => (existsSync(join(home, "requests.jsonl")) ? loggedRequests(home).length : 0);

test("a call of check_back that runs again after the agent stopped in the middle of it finds the wake-up it set, and sets no second one", { timeout }, async (t) => {
  const home = tempDir(t, "wakeups");
  const model = callingTools([[{ name: "check_back", args: { in: "1s", note: "look at the build" } }]]);
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
  // Had the call set a second wake-up, it would be due about now too.
  await delay(1_500);
  assert.equal(wakeupsTold(back.told), 1);
  assert.equal(back.told.length, 2, "the message that asked, and the one wake-up");
  assert.equal(requests(home), 3, "the call, the answer once the call is back, and the wake-up");
  assert.deepEqual(back.reports, []);
});
