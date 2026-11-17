import { parseConfig } from "../../lib/json-config/index.ts";
import { nameKey } from "../gateway/index.ts";

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

const CHOICES = '"none", "mentions", "people" or "all"';

/**
 * What a wake file says: for each room it names, the policy the agent is woken
 * by there. The rooms are in `rooms`, by name, and any other key, a room named
 * twice in different cases or a policy that is not one is an error that names
 * the file and the place.
 */
export function parseWake(text: string, file: string): WakeSettings {
  const root = parseConfig(text, file);
  const rooms = root.optionalStrings("rooms") ?? {};
  root.done();
  const named = new Set<string>();
  const settings: Record<string, WakePolicy> = {};
  for (const [room, policy] of Object.entries(rooms)) {
    if (!isWakePolicy(policy)) throw root.problem(`rooms.${room}`, `must be ${CHOICES}, not "${policy}"`);
    if (named.has(nameKey(room))) throw root.problem(`rooms.${room}`, "is a room named already, whatever the case");
    named.add(nameKey(room));
    settings[room] = policy;
  }
  return settings;
}
