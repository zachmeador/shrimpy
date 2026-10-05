import type { Context } from "@earendil-works/chord";
import { createContextKey, withContextValue } from "@earendil-works/chord/context";
import type { RoutedSessionHandle } from "@earendil-works/pi-server";
import type { Member, SessionService } from "../../contracts/agent/index.ts";
import { refuse } from "../../lib/refusal/index.ts";

/** Who is on the other end of a connection to the agent. */
export type Caller =
  /** Came by the home's path: whoever the operating system lets reach the home's socket, which is whoever owns the home. */
  | { via: "home" }
  /** Came through the gateway, which said who they are. */
  | { via: "gateway"; member: Member };

/**
 * What a caller may be allowed to do at an agent. Messaging is the chat
 * server's, so what is left is looking at sessions and triggers, steering and
 * stopping the sessions and firing the triggers, and changing what the agent is
 * told.
 */
export type Permission = "watch" | "control" | "administer";

const WHAT: Record<Permission, string> = {
  watch: "watch its sessions and triggers",
  control: "steer or stop its sessions, or fire its triggers",
  administer: "change what it is told",
};

/**
 * Whether `caller` may do `permission` here. Nothing decides yet what a member
 * may do: under one operating system user everyone may do everything. When
 * something does, this is where, and every operation of the agent's API
 * already asks.
 */
function permits(_caller: Caller, _permission: Permission): boolean {
  return true;
}

/** Refuse unless `caller` may do `permission` at this agent. */
export function check(caller: Caller, permission: Permission): void {
  if (permits(caller, permission)) return;
  const who = caller.via === "home" ? "The home's owner" : caller.member.name;
  refuse(`${who} may not ${WHAT[permission]} at this agent.`, "service_not_allowed");
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
