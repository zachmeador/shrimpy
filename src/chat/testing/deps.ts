import type { TestContext } from "node:test";
import type { Member } from "../../contracts/chat/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { type ChatDeps, createWorkingMarks, listThreads, openDm } from "../threads/index.ts";
import { agent, type Clock, fakeClock, person } from "./fixtures.ts";
import { openTestStore } from "./store.ts";

/** The chat operations over a fresh store, with a clock the test moves, and no gateway to say who anyone is. */
export function openTestDeps(t: TestContext): { deps: ChatDeps; clock: Clock } {
  const { store } = openTestStore(t);
  const clock = fakeClock();
  const identity = {
    redeem: () => refuse("There is no gateway in this test."),
    member: () => Promise.resolve(undefined),
  };
  return { deps: { store, working: createWorkingMarks(), identity, now: clock.now }, clock };
}

/** An identity that says everyone who comes in is `member`, for a test whose subject is not who people are. */
export function identityOf(member: Member) {
  return { redeem: () => Promise.resolve(member), member: () => Promise.resolve(member) };
}

/** Record a member in the store, or give one already there its new name, as coming in does. */
export function know(deps: ChatDeps, member: Member): Member {
  deps.store.transaction((tx) => tx.saveMember(member));
  return member;
}

/**
 * The chat operations over a fresh store, with Zach and Alice, people, and
 * Shrimpy, an agent, known to it, and the DM between Zach and Shrimpy with its
 * main thread.
 */
export async function openTestDm(t: TestContext) {
  const { deps, clock } = openTestDeps(t);
  const zach = know(deps, person("Zach"));
  const shrimpy = know(deps, agent("Shrimpy"));
  const alice = know(deps, person("Alice"));
  const dm = await openDm(deps, zach, shrimpy.id);
  const [main] = listThreads(deps, zach, dm.id);
  if (main === undefined) throw new Error("the DM has no main thread");
  return { deps, clock, zach, shrimpy, alice, dm, main };
}
