import { test } from "node:test";
import { stopAfter } from "../../lib/testing/index.ts";
import type { Working } from "../turns/index.ts";
import { startChatRig } from "./testing/index.ts";
import { markWorking } from "./working.ts";

const timeout = 15_000;

/** What the sessions know, as a test says it: the threads being worked in, which it changes. */
function sessionsWorkingIn() {
  let threads: string[] = [];
  const listeners = new Set<() => void>();
  const working: Working = {
    threads: () => Promise.resolve(new Set(threads)),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    untilTold: () => Promise.resolve(),
  };
  return {
    working,
    set(next: string[]) {
      threads = next;
      for (const listener of listeners) listener();
    },
  };
}

test("chat is told which thread the agent is working in, and again on a new connection, until the work is done", { timeout }, async (t) => {
  const rig = await startChatRig(t);
  const sessions = sessionsWorkingIn();
  stopAfter(t, markWorking(rig.link, sessions.working, (error) => rig.errors.push(error)));

  sessions.set([rig.thread.id]);
  await rig.untilWorking();

  await rig.chat.outage();
  await rig.chat.recover();
  await rig.untilWorking();

  sessions.set([]);
  await rig.untilIdle();
});
