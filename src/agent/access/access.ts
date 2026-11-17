import { needsAdmin, type Principal, type Refused, refused, type RosterNow } from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";

/** Who is asking the agent, as the agent decides from who the request is stamped as and from the roster now. */
export type Caller =
  /** A client on the home's own socket: whoever the operating system lets reach it, which is whoever owns the home. */
  | { kind: "home" }
  /** A member, as the gateway stamped the request, with its name and whether it is an admin as the roster has them now. */
  | {
      kind: "member";
      member: { id: string; kind: "person" | "agent"; name: string };
      admin: boolean;
      /** Whether it is this agent. */
      self: boolean;
      /** The admins as the roster has them now, for a refusal to say who to ask. */
      admins: readonly { name: string }[];
    }
  /** A program that is no member, such as the chat server. */
  | { kind: "program" };

/**
 * What a caller may be allowed to do at an agent. Messaging is the chat
 * server's, so what is left is looking at sessions, models and triggers,
 * steering and stopping the sessions and firing the triggers, and changing what
 * the agent is told. They name what an operation needs, and today every one
 * needs the same.
 */
export type Permission = "watch" | "control" | "administer";

/**
 * What each takes, written to start a sentence, for the refusal of someone who
 * may not. Watching comes first in every command that controls a session, so a
 * refusal that says only "watching" would not say what was asked for.
 */
const LOOKING_AFTER = "Watching or controlling another agent's sessions and triggers";
const WHAT: Record<Permission, string> = {
  watch: LOOKING_AFTER,
  control: LOOKING_AFTER,
  administer: "Changing what another agent is told",
};

/**
 * The caller `principal` is, by the roster as it is now, which is undefined
 * until the agent has first heard it. A member the roster doesn't name is no
 * admin, and goes by its ID until it does.
 */
export function callerOf(principal: Principal, roster: RosterNow | undefined): Caller {
  if (principal.kind === "home") return { kind: "home" };
  if (principal.kind !== "person" && principal.kind !== "agent") return { kind: "program" };
  const entry = roster?.members.find((each) => each.id === principal.member);
  return {
    kind: "member",
    member: { id: principal.member, kind: principal.kind, name: entry?.name ?? principal.member },
    admin: entry?.admin ?? false,
    self: roster?.you?.id === principal.member,
    admins: (roster?.members ?? []).filter((each) => each.admin).map((each) => ({ name: each.name })),
  };
}

/**
 * Why `caller` may not do `permission` here, or null when it may. The home's
 * owner may do anything, and so may you, an admin and the agent itself: an
 * agent looks after itself, and another agent's sessions and triggers are for
 * you and the admins. A program that is no member may do none of it.
 */
export function refusalFor(caller: Caller, permission: Permission): Refused | null {
  switch (caller.kind) {
    case "home":
      return null;
    case "program":
      return refused("Only a member, through the gateway, or a client on the agent's own socket may ask an agent anything.");
    case "member":
      if (caller.member.kind === "person" || caller.admin || caller.self) return null;
      return needsAdmin(WHAT[permission], caller.member, caller.admins);
  }
}

/** Refuse unless `caller` may do `permission` at this agent. */
export function check(caller: Caller, permission: Permission): void {
  const refusal = refusalFor(caller, permission);
  if (refusal !== null) refuse(refusal.words);
}
