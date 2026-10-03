import type { TestContext } from "node:test";
import { type ChatDeps, createWorkingMarks, identify, listThreads, openDm } from "../threads/index.ts";
import { agent, type Clock, fakeClock, person } from "./fixtures.ts";
import { openTestStore } from "./store.ts";

/** The chat operations over a fresh store, with a clock the test moves. */
export function openTestDeps(t: TestContext): { deps: ChatDeps; clock: Clock } {
  const { store } = openTestStore(t);
  const clock = fakeClock();
  return { deps: { store, working: createWorkingMarks(), now: clock.now }, clock };
}

/**
 * The chat operations over a fresh store, with Zach and Alice, people, and
 * Shrimpy, an agent, known to it, and the DM between Zach and Shrimpy with its
 * main thread.
 */
export function openTestDm(t: TestContext) {
  const { deps, clock } = openTestDeps(t);
  const zach = identify(deps, person("Zach"));
  const shrimpy = identify(deps, agent("Shrimpy"));
  const alice = identify(deps, person("Alice"));
  const dm = openDm(deps, zach, shrimpy);
  const [main] = listThreads(deps, zach, dm.id);
  if (main === undefined) throw new Error("the DM has no main thread");
  return { deps, clock, zach, shrimpy, alice, dm, main };
}
