/**
 * What wakes the agent in a room, as the agent chooses it for each room. The
 * choice is made in a file of the agent's home, which the agent reads at its
 * start and when it is told to reload; this is what that file can say and what
 * the agent holds of it.
 */

/**
 * `none` wakes the agent for nothing in the room. `mentions` wakes it for a
 * message that mentions it or says `@all`, and for an answer to a message of its
 * own. `people` wakes it for those and for every message a person writes in the
 * room that mentions nobody, which is for every agent there. `all` wakes it for
 * every message, whoever wrote it, its own excepted. Whatever the policy, but for
 * `none`, a reaction to a message the agent wrote wakes it too.
 */
export const WAKE_POLICIES = ["none", "mentions", "people", "all"] as const;
export type WakePolicy = (typeof WAKE_POLICIES)[number];

/** The policy of a room the agent has set nothing for. */
export const DEFAULT_WAKE_POLICY: WakePolicy = "people";

export const isWakePolicy = (value: string): value is WakePolicy => (WAKE_POLICIES as readonly string[]).includes(value);

/** The policy the agent chose for each room it chose one for, by the room's name as it was written. */
export type WakeSettings = Readonly<Record<string, WakePolicy>>;

/** What the intake needs to know of the agent's choices. */
export interface WakePolicies {
  /** The policy of the room with this name, whatever the case. */
  of(room: string): WakePolicy;
  /** Whether the agent chose a policy for any room, so that a room's name is needed to decide anything. */
  anySet(): boolean;
}

/** The choices the agent holds, which a reload replaces. */
export interface Wakes extends WakePolicies {
  /** Hold these settings from now on. */
  replace(settings: WakeSettings): void;
}

export function createWakes(settings: WakeSettings = {}): Wakes {
  let held = lowered(settings);
  return {
    of: (room) => held.get(room.toLowerCase()) ?? DEFAULT_WAKE_POLICY,
    anySet: () => held.size > 0,
    replace(next) {
      held = lowered(next);
    },
  };
}

const lowered = (settings: WakeSettings): ReadonlyMap<string, WakePolicy> =>
  new Map(Object.entries(settings).map(([room, policy]) => [room.toLowerCase(), policy]));
