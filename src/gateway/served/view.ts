import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { FollowAttach, FollowObserver } from "@earendil-works/chord";
import type { Program, RosterEntry, WayIn } from "../../contracts/gateway/index.ts";

/** What the gateway's objects show, before each caller's share of it is taken. */
export type GatewayView = {
  members: RosterEntry[];
  programs: Program[];
  ways: WayIn[];
};

/** The view kept current, for the gateway's objects to follow. */
export interface View {
  /** Work the view out again, and tell those who follow it if it changed. */
  changed(): void;
  /** What Chord's `self.follow` takes. */
  readonly follow: FollowAttach<GatewayView>;
}

/** A view made by `read`, which is asked again at each change. */
export function createView(read: () => GatewayView): View {
  let current = read();
  let written = JSON.stringify(current);
  const followers = new Set<FollowObserver<unknown>>();
  return {
    changed() {
      const next = read();
      const text = JSON.stringify(next);
      if (text === written) return;
      current = next;
      written = text;
      for (const follower of followers) {
        follower.advance({ kind: "value", value: next, ops: [["r", next]], retired: false }, BACKGROUND_CONTEXT);
      }
    },
    follow: async (follower) => {
      followers.add(follower);
      return { value: current, detach: () => void followers.delete(follower) };
    },
  };
}
