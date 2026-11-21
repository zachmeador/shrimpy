/**
 * The way a member came in, which is where its access came from. Two of your
 * devices are two ways, so they hold separate objects, and taking one device's
 * token back ends only what it holds.
 */
export type Way =
  /** The gateway's own socket, with no token. */
  | { kind: "socket" }
  /** A device's token. */
  | { kind: "device"; id: string }
  /** An agent's token. */
  | { kind: "token"; id: string };

/**
 * Who is asking, as Chord stamps it on every request. The gateway stamps a
 * link from its way in, and a program believes a stamp only on its own link
 * from the gateway. No principal carries a name or whether it is an admin:
 * names change and a promotion counts at once, so the program that is asked
 * reads both from the roster.
 */
export type Principal =
  /** You. */
  | { kind: "person"; member: string; way: Way }
  /** An agent's program, or a command in its shell. */
  | { kind: "agent"; member: string; way: Way }
  /** A client on an agent's home socket, and the agent's own requests. */
  | { kind: "home" }
  /** The chat server's own requests. */
  | { kind: "chat" }
  /** The gateway's own requests. */
  | { kind: "gateway" };

/** What takes a principal's access away: one way in (a device's or an agent's token), or a removed member as a whole. */
export type Revocation = { way: string } | { member: string };

/**
 * What takes a principal's access away: its member ID (when an agent is
 * removed) and, for a device or an agent, its token's way. The other ways are
 * guarded by the operating system. Every program's host uses this one function,
 * as Chord asks.
 */
export function revokedBy(principal: Principal): Revocation[] {
  if (principal.kind !== "person" && principal.kind !== "agent") return [];
  const { way } = principal;
  const revocations: Revocation[] = [{ member: principal.member }];
  if (way.kind === "device" || way.kind === "token") revocations.push({ way: way.id });
  return revocations;
}
