import { defineFacet, type Facet, type FollowAttach } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import { Agent, AgentPresence, type Reloaded, Session, type SessionPage } from "../contracts/agent/index.ts";
import { type Answer, done, type Principal, type Refused, refused } from "../contracts/gateway/index.ts";
import { follow } from "../lib/follow/index.ts";
import { isRefusal, refuse } from "../lib/refusal/index.ts";
import { type Caller, callerOf, type Permission, refusalFor } from "./access/index.ts";
import type { LiveRoster } from "./links/index.ts";
import type { Sessions } from "./sessions/durable.ts";
import type { Triggers } from "./triggers/durable.ts";

/** What the agent's objects are served from. */
export interface ServedParts {
  sessions: Sessions;
  triggers: Triggers;
  /** Read the home's instructions, context files, skills, triggers, wake file and model again. */
  reload(): Promise<Reloaded>;
  /** The roster as the agent holds it, which says who a member is and whether it is an admin. */
  roster: LiveRoster;
  /** Whether new work may still be started: it may not once the agent is stopping. */
  takingInput(): boolean;
}

const EMPTY: SessionPage = { items: [], before: null };

const STOPPING = "The agent is stopping and is not taking new input.";

/** What a method did, or the refusal it threw. Anything else it throws, it throws. */
async function answering<T>(work: () => Promise<T>): Promise<Answer<T>> {
  try {
    return done(await work());
  } catch (error) {
    if (isRefusal(error)) return refused(error.message);
    throw error;
  }
}

/**
 * The objects an agent serves at `agent({ name })`: `Agent` and a `Session` for
 * each one a caller holds, one of each for each caller, kept live from the
 * engine and the roster, so nothing polls; `AgentPresence`, which the gateway
 * holds; and each method, answered with what it did or a refusal. Who the caller
 * is comes from the stamp on the request: the gateway's, on the agent's link
 * from it, or `home`, on the home's own socket. A member's name and whether it
 * is an admin come from the roster as it is now, so a promotion counts at once.
 */
export function agentFacet(parts: ServedParts): Facet<Principal> {
  const { sessions, triggers, roster } = parts;

  /** The caller as the roster has it now, once it is known for an agent, whose admin and self it decides. */
  const callerNow = async (principal: Principal, signal: AbortSignal | undefined): Promise<Caller> => {
    if (principal.kind === "agent") await roster.known(signal);
    return callerOf(principal, roster.now());
  };

  /** Refuse unless the caller may do `permission`. */
  const allow = async (principal: Principal, permission: Permission, context: Context): Promise<void> => {
    const refusal = refusalFor(await callerNow(principal, context.abortSignal), permission);
    if (refusal !== null) refuse(refusal.words);
  };

  /** Why the caller may not watch the agent, or null, kept live from the roster. */
  const watching = (principal: Principal): FollowAttach<Refused | null> =>
    follow({
      read: async () => refusalFor(await callerNow(principal, undefined), "watch"),
      watch: (changed) => roster.subscribe(changed),
    });

  return defineFacet<Principal>((host) => {
    host.serve(AgentPresence, () => ({ variant: "present", members: {} }));

    host.serve(Agent, (_params, principal, self) => {
      const refusal = self.follow(watching(principal));
      const listed = self.follow(sessions.listed);
      const standing = self.follow(triggers.listed);
      return {
        variant: "all",
        members: {
          refusal,
          sessions: self.derive([refusal, listed], ([no, list]) => (no === null ? list : [])),
          triggers: self.derive([refusal, standing], ([no, list]) => (no === null ? list : [])),
          models: async (ctx) =>
            answering(async () => {
              await allow(principal, "watch", ctx);
              return sessions.models();
            }),
          trigger: async ({ name }, ctx) =>
            answering(async () => {
              await allow(principal, "watch", ctx);
              return triggers.show(name);
            }),
          fire: async ({ name }, ctx) =>
            answering(async () => {
              await allow(principal, "control", ctx);
              if (!parts.takingInput()) refuse(STOPPING);
              return triggers.fire(name);
            }),
          reload: async (ctx) =>
            answering(async () => {
              await allow(principal, "administer", ctx);
              return parts.reload();
            }),
        },
      };
    });

    host.serve(Session, ({ session: address }, principal, self) => {
      const allowed = self.follow(watching(principal));
      const shown = self.follow(sessions.shown(address));
      const refusal = self.derive([allowed, shown], ([no, view]) =>
        no ?? (view.made ? null : refused(`This agent has no session for ${address} yet.`)),
      );
      return {
        variant: "all",
        members: {
          refusal,
          window: self.derive([refusal, shown], ([no, view]) => (no === null ? view.window : EMPTY)),
          status: self.derive([refusal, shown], ([no, view]) => (no === null ? view.status : null)),
          read: async ({ before, limit }, ctx) =>
            answering(async () => {
              await allow(principal, "watch", ctx);
              return sessions.read(address, before, limit, ctx);
            }),
          // Accepted work never ends because the caller went away, so what changes the work is not tied to the call.
          steer: async ({ text, request }, ctx) =>
            answering(async () => {
              await allow(principal, "control", ctx);
              if (!parts.takingInput()) refuse(STOPPING);
              return sessions.steer(address, text, request, BACKGROUND_CONTEXT);
            }),
          wait: async ({ submission }, ctx) =>
            answering(async () => {
              await allow(principal, "watch", ctx);
              return sessions.wait(address, submission, ctx);
            }),
          stop: async (ctx) =>
            answering(async () => {
              await allow(principal, "control", ctx);
              await sessions.stop(address, BACKGROUND_CONTEXT);
              return null;
            }),
        },
      };
    });
  });
}
