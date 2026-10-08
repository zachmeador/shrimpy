import type { Context } from "@earendil-works/chord";
import { createContextKey, withContextValue } from "@earendil-works/chord/context";
import type { RoutedSessionHandle } from "@earendil-works/pi-server";
import type { Member, SessionService } from "../../contracts/agent/index.ts";
import { refuseNeedsAdmin } from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";

/** Someone who came through the gateway, as the agent learned who they are when they came in. */
export interface Asker {
  /** Who the gateway says they are. */
  member: Member;
  /** Whether the roster said they are an admin then. */
  admin: boolean;
  /** Whether they are this agent. */
  self: boolean;
  /** The admins the roster listed then, for a refusal to say who to ask. */
  admins: readonly { name: string }[];
}

/** Who is on the other end of a connection to the agent. */
export type Caller =
  /** Came by the home's path: whoever the operating system lets reach the home's socket, which is whoever owns the home. */
  | { via: "home" }
  /** Came through the gateway, which said who they are. */
  | ({ via: "gateway" } & Asker);

/**
 * What a caller may be allowed to do at an agent. Messaging is the chat
 * server's, so what is left is looking at sessions, models and triggers,
 * steering and stopping the sessions, choosing their models and firing the
 * triggers, and changing what the agent is told. They name what an operation
 * needs, and today every one needs the same.
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
 * Whether `caller` may do `permission` here. The home's owner may do anything.
 * Someone who came through the gateway may if they are a person, an admin or
 * the agent itself, and no one else: an agent looks after itself, and another
 * agent's sessions and triggers are for the people and the admins. Every
 * operation of the agent's API already asks.
 */
function permits(caller: Caller, _permission: Permission): boolean {
  if (caller.via === "home") return true;
  return caller.member.kind === "person" || caller.admin || caller.self;
}

/** Refuse unless `caller` may do `permission` at this agent. */
export function check(caller: Caller, permission: Permission): void {
  if (permits(caller, permission)) return;
  // The home's owner is never refused, so whoever is came through the gateway.
  if (caller.via === "home") throw new Error("The home's owner was refused.");
  refuseNeedsAdmin(WHAT[permission], caller.member, caller.admins);
}

/** Who is making a call that reaches a session, which Pi does not tell the session's service. */
const CALLER = createContextKey<Caller>("shrimpy.agent.caller");

/** A context for a call made on behalf of `caller`. */
export const withCaller = (context: Context, caller: Caller): Context => withContextValue(CALLER, caller, context);

const callerOf = (context: Context): Caller =>
  context.value(CALLER) ??
  refuse("Come in with a ticket from the gateway, with enter, before anything else.", "service_not_allowed");

/** `service`, with each call that follows or changes the work checked against whoever makes it. */
export function guardSession(service: SessionService): SessionService {
  return {
    state: service.state,
    steer(text, requestId, context) {
      check(callerOf(context), "control");
      return service.steer(text, requestId, context);
    },
    wait(submission, context) {
      check(callerOf(context), "watch");
      return service.wait(submission, context);
    },
    stop(context) {
      check(callerOf(context), "control");
      return service.stop(context);
    },
    setModel(model, context) {
      check(callerOf(context), "control");
      return service.setModel(model, context);
    },
  };
}

/**
 * Make every call on a session carry the caller of the connection that
 * attached it. `attach` puts the caller in the context it hands Pi, and Pi
 * gives that context back when it attaches the session, which is the only
 * moment a session's calls meet the connection they come from.
 */
export function carryCallers(handle: RoutedSessionHandle): RoutedSessionHandle {
  return {
    terminated: handle.terminated,
    close: (context) => handle.close(context),
    async attachClient(context) {
      const lease = await handle.attachClient(context);
      const caller = callerOf(context);
      return {
        release: (releaseContext) => lease.release(releaseContext),
        invokeService: (call, publish, callContext) =>
          lease.invokeService(call, publish, withCaller(callContext, caller)),
      };
    },
  };
}
