import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fauxAssistantMessage, type Message } from "@earendil-works/pi-ai";
import { defineExtension } from "@earendil-works/pi-durable";
import { eventually, stopAfter, tempDir } from "../../lib/testing/index.ts";
import { wakeupTools } from "../extensions/index.ts";
import { openHost } from "../host/index.ts";
import { type Delivery, isWakeup, type Outstanding, type TurnOutcome } from "../intake/index.ts";
import { callingTools, fauxModels, loggedRequests, type Script } from "../testing/index.ts";
import { createSessions, createWakeups, turnTask } from "./index.ts";

/*
 * Wake-ups on the real engine, with no chat. The engine is stopped without
 * saying so, as a kill leaves it, at instants that a test of the whole agent
 * can't pick.
 */

const timeout = 30_000;

type Tools = ReturnType<typeof wakeupTools>;

/** The tool, except that once it has set its wake-up it never returns, as if the agent died then. `set` is told when. */
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
  /** How fast the model streams. Fast unless a test needs to catch a turn running. */
  tokensPerSecond?: number;
  /** Stand in for the tool the agent has. */
  tools?: (real: Tools) => Tools;
}

/**
 * An agent's host and sessions on `home`, with what the tasks tell their
 * sources kept in `told`. Stopping it is not an orderly end, so the next start
 * counts the turns it left underway as having been through a crash.
 */
async function start(t: TestContext, home: string, script: Script, options: StartOptions = {}) {
  const told: { input: Outstanding; outcome: TurnOutcome }[] = [];
  const delivery: Delivery = {
    attach: () => undefined,
    tell(input, outcome) {
      told.push({ input, outcome });
      return Promise.resolve();
    },
    close: () => undefined,
  };
  const { models, model } = fauxModels({ home, script, tokensPerSecond: options.tokensPerSecond ?? 4000 });
  const reports: Error[] = [];
  const turn = turnTask({ delivery, onError: (error) => reports.push(error) });
  const wakeups = createWakeups(turn.task, { onError: (error) => reports.push(error) });
  const host = await openHost({ home, models });
  host.install(turn.extension, wakeups.extension, (options.tools ?? ((real) => real))(wakeupTools({ wakeups })));
  let closing: Promise<void> | undefined;
  const stop = (): Promise<void> => (closing ??= host.close());
  stopAfter(t, stop);
  const sessions = createSessions(host.harness, { model, cwd: home }, turn.task);
  await sessions.applyDefaults();
  await sessions.start();
  host.resume();
  return {
    told,
    reports,
    stop,
    /** A message from a person in a thread of its own, as the agent takes it up. */
    admit: () =>
      sessions.admissions.admit({
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

/** Whether any message the model is given says `text`. */
function shows(messages: readonly Message[], text: string): boolean {
  return messages.some((message) => message.role === "user" && JSON.stringify(message.content).includes(text));
}

test("a call of check_back that runs again after a crash finds the wake-up it set, and sets no second one", { timeout }, async (t) => {
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

test("a wake-up's turn that the agent was killed in twice is not run a third time, and is told it failed", { timeout }, async (t) => {
  const home = tempDir(t, "wakeups");
  // The first turn asks to be woken, and the wake-up starts a long answer, which a kill interrupts.
  const asking = callingTools([[{ name: "check_back", args: { in: "1s", note: "stream it" } }]]);
  const long = fauxAssistantMessage(Array.from({ length: 200 }, (_, line) => `line ${String(line)}`).join("\n"));
  const script: Script = (messages, directory) => (shows(messages, "stream it") ? long : asking.script(messages, directory));
  const options = { tokensPerSecond: 40 };

  const first = await start(t, home, script, options);
  await first.admit();
  await eventually(() => requests(home), (asked) => asked >= 3, { what: "the wake-up's turn to start", timeoutMs: 15_000 });
  await first.stop();
  const second = await start(t, home, script, options);
  await eventually(() => requests(home), (asked) => asked >= 4, { what: "the turn to start again", timeoutMs: 15_000 });
  await second.stop();

  const third = await start(t, home, script, options);

  const told = await eventually(() => third.told, (found) => wakeupsTold(found) === 1, { what: "the wake-up to be told how it ended" });
  assert.equal(told.find(({ input }) => isWakeup(input))?.outcome.kind, "failed");
  assert.equal(requests(home), 4, "the model was not asked a fifth time");
});
