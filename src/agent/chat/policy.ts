import { DEFAULT_WAKE_POLICY, type WakePolicy, type WakeSettings } from "../home/index.ts";

/**
 * What wakes the agent in a room, as the agent chooses it for each room. The
 * choice is made in a file of the agent's home, which the agent reads at its
 * start and again whenever it changes; this is what the agent holds of it.
 */

/** What chat needs to know of the agent's choices. */
export interface WakePolicies {
  /** The policy of the room with this name, whatever the case. */
  of(room: string): WakePolicy;
}

/** The choices the agent holds, which reading the file again replaces. */
export interface Wakes extends WakePolicies {
  /** Hold these settings from now on. */
  replace(settings: WakeSettings): void;
}

export function createWakes(settings: WakeSettings = {}): Wakes {
  let held = lowered(settings);
  return {
    of: (room) => held.get(room.toLowerCase()) ?? DEFAULT_WAKE_POLICY,
    replace(next) {
      held = lowered(next);
    },
  };
}

const lowered = (settings: WakeSettings): ReadonlyMap<string, WakePolicy> =>
  new Map(Object.entries(settings).map(([room, policy]) => [room.toLowerCase(), policy]));
