import type { TestContext } from "node:test";
import { type ChatDeps, createWorkingMarks } from "../threads/index.ts";
import { type Clock, fakeClock } from "./fixtures.ts";
import { openTestStore } from "./store.ts";

/** The chat operations over a fresh store, with a clock the test moves. */
export function openTestDeps(t: TestContext): { deps: ChatDeps; clock: Clock } {
  const { store } = openTestStore(t);
  const clock = fakeClock();
  return { deps: { store, working: createWorkingMarks(), now: clock.now }, clock };
}
