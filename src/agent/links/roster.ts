import type { RosterEntry } from "../../contracts/gateway/index.ts";

/** Who a name on the roster is, as the agent's tools look one up. */
export type Named =
  /** The agent has not heard the roster yet. */
  | { kind: "unknown" }
  | { kind: "nobody"; roster: readonly RosterEntry[] }
  /** The agent itself. */
  | { kind: "self"; member: RosterEntry }
  | { kind: "found"; member: RosterEntry };

/** The member of `roster` called `name`, whatever the case. `self` is the agent's own ID. */
export function memberNamed(roster: readonly RosterEntry[] | undefined, name: string, self: string): Named {
  if (roster === undefined) return { kind: "unknown" };
  const wanted = name.toLowerCase();
  const member = roster.find((each) => each.name.toLowerCase() === wanted);
  if (member === undefined) return { kind: "nobody", roster };
  return member.id === self ? { kind: "self", member } : { kind: "found", member };
}
