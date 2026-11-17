import { DEFAULT_WAKE_POLICY, type WakePolicy, type WakeSettings } from "../../contracts/agent/index.ts";
import { nameKey } from "../../contracts/gateway/index.ts";

/**
 * What wakes the agent in each room, as it chose in a file of its home, which it
 * reads at its start and again whenever it changes.
 */
export interface Wakes {
  /** The policy of the room with this name, whatever the case. */
  of(room: string): WakePolicy;
  /** Hold these settings from now on. */
  replace(settings: WakeSettings): void;
}

export function createWakes(settings: WakeSettings = {}): Wakes {
  let held = lowered(settings);
  return {
    of: (room) => held.get(nameKey(room)) ?? DEFAULT_WAKE_POLICY,
    replace(next) {
      held = lowered(next);
    },
  };
}

const lowered = (settings: WakeSettings): ReadonlyMap<string, WakePolicy> =>
  new Map(Object.entries(settings).map(([room, policy]) => [nameKey(room), policy]));
