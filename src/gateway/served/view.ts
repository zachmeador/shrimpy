import type { JsonValue } from "@earendil-works/chord/json";
import type { Program, RosterEntry, TurnedAwayProgram, WayIn } from "../../contracts/gateway/index.ts";
import { type FollowAttach, follow } from "../../lib/follow/index.ts";

/** What the gateway's objects show, before each caller's share of it is taken. */
export type GatewayView = {
  id: string;
  members: RosterEntry[];
  programs: Program[];
  turnedAway: TurnedAwayProgram[];
  ways: WayIn[];
};

/** A view, for the gateway's objects to follow. */
export interface View<T> {
  /** Something the view is worked out from changed: whoever follows it reads it again. */
  changed(): void;
  /** What Chord's `self.follow` takes. */
  readonly follow: FollowAttach<T>;
}

/** A view that `read` works out at once, for each object that follows it and again at each change. */
export function createView<T extends JsonValue>(read: () => T): View<T> {
  const followers = new Set<() => void>();
  return {
    changed() {
      for (const follower of [...followers]) follower();
    },
    follow: follow({
      read,
      watch(changed) {
        followers.add(changed);
        return () => void followers.delete(changed);
      },
    }),
  };
}
