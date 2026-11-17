import type { TestContext } from "node:test";
import type { Member } from "../../contracts/chat/index.ts";
import type { Identity } from "../identity/index.ts";
import { type ChatDeps, createWorkingMarks } from "../threads/index.ts";
import { type Clock, fakeClock } from "./fixtures.ts";
import { openTestStore, reportToStderr } from "./store.ts";

/**
 * The chat operations over a fresh store, with a clock the test moves and a
 * roster of the members the test knows, all of them admins. `know` puts a
 * member on the roster and in the store, as its first call to chat does.
 */
export function openTestDeps(t: TestContext): { deps: ChatDeps; clock: Clock; know: (member: Member) => Member } {
  const { store } = openTestStore(t);
  const clock = fakeClock();
  const roster = new Map<string, Member>();
  const identity: Identity = { member: (id) => roster.get(id), admins: () => [...roster.values()] };
  return {
    deps: { store, working: createWorkingMarks({ onError: reportToStderr }), identity, now: clock.now },
    clock,
    know: (member) => {
      roster.set(member.id, member);
      store.transaction((tx) => tx.saveMember(member));
      return member;
    },
  };
}
