import { replicatedState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { RoutedServerPresentation } from "@earendil-works/pi-server";
import { Refusal, refuse } from "../../../lib/refusal/index.ts";
import { offer, type Offer } from "../../../lib/testing/index.ts";
import { type Member, type SessionDirectory, SessionService, type SessionView } from "../index.ts";
import { sessionView } from "./views.ts";

/** One session of a scripted agent: what its clients see, and what they did to it. */
export interface ScriptedSession {
  readonly threadId: string;
  readonly channelId: string;
  /** A copy of what clients of the session see now. */
  readonly view: SessionView;
  /** Show clients this view. */
  show(view: SessionView): void;
  /** Show clients the view after `change` has edited a copy of the current one. */
  update(change: (view: SessionView) => void): void;
  /** How many times a client stopped the session's work. */
  readonly stops: number;
  /** Make stops be refused with `reason`, as written, or work again with undefined. */
  failStops(reason: string | undefined): void;
}

/**
 * An agent's sessions, scripted by a test: which exist, what each shows, and
 * what clients did to them. It answers the agent API as the agent does, with
 * the same refusal for a session it has none of.
 */
export interface ScriptedAgent {
  /**
   * What one connection talks to. Given the connection's presentation, the
   * connection can attach a session. It comes in with a ticket before anything
   * else, as a connection through the gateway does, and `whose` says whose a
   * ticket is.
   */
  serve(presentation: RoutedServerPresentation, whose: (ticket: string) => Promise<Member>): SessionDirectory;
  /** The session behind a thread, for a server that sends a connection that attaches it there: undefined when there is none. */
  route(threadId: string): Offer | undefined;

  /** Make the session behind a thread, idle and empty unless `view` says more. Making it again gives the same session. */
  session(threadId: string, options?: { view?: SessionView }): ScriptedSession;
}

interface Held {
  session: ScriptedSession;
  service: SessionService;
}

const noTrigger = (name: string): Refusal => new Refusal(`This agent has no trigger called ${name}.`);

export function scriptedAgent(): ScriptedAgent {
  const held = new Map<string, Held>();
  // The agent says a session has work when it is answering input or has input queued.
  const working = (view: SessionView): boolean => view.status.busy || view.status.queued.length > 0;

  function session(threadId: string, options: { view?: SessionView } = {}): ScriptedSession {
    const existing = held.get(threadId);
    if (existing !== undefined) return existing.session;

    const state = replicatedState(structuredClone(options.view ?? sessionView()));
    let stops = 0;
    let refusal: string | undefined;
    const made: ScriptedSession = {
      threadId,
      channelId: `ch_${threadId.slice(3)}`,
      get view() {
        return structuredClone(state.value);
      },
      show: (view) => state.replace(BACKGROUND_CONTEXT, structuredClone(view)),
      update(change) {
        const next = structuredClone(state.value);
        change(next);
        state.replace(BACKGROUND_CONTEXT, next);
      },
      get stops() {
        return stops;
      },
      failStops(reason) {
        refusal = reason;
      },
    };
    const service: SessionService = {
      state,
      steer: () => Promise.resolve({ submission: 1 }),
      wait: () => Promise.reject(new Error("A scripted agent does not settle input.")),
      stop() {
        stops += 1;
        return refusal === undefined ? Promise.resolve() : Promise.reject(new Refusal(refusal, "service_not_allowed"));
      },
    };
    held.set(threadId, { session: made, service });
    return made;
  }

  return {
    serve(presentation, whose) {
      let entered = false;
      const admitted = <T>(call: () => Promise<T>): Promise<T> =>
        entered
          ? call()
          : Promise.resolve().then(() =>
              refuse("Come in with a ticket from the gateway, with enter, before anything else.", "service_not_allowed"),
            );
      return {
        async enter(ticket) {
          const member = await whose(ticket);
          entered = true;
          return member;
        },
        list: () =>
          admitted(() =>
            Promise.resolve(
              [...held.values()].map(({ session: each }) => ({
                id: each.threadId,
                threadId: each.threadId,
                channelId: each.channelId,
                working: working(each.view),
              })),
            ),
          ),
        attach: (address, context) =>
          admitted(async () => {
            if (!held.has(address)) refuse(`This agent has no session for ${address} yet.`);
            await presentation.attachSession(address, context);
          }),
        detach: (context) => admitted(() => presentation.detachSession(context)),
        // A scripted agent has no triggers.
        triggers: () => admitted(() => Promise.resolve([])),
        trigger: (name) => admitted(() => Promise.reject(noTrigger(name))),
        fire: (name) => admitted(() => Promise.reject(noTrigger(name))),
        reload: () => admitted(() => Promise.resolve({ soul: false, files: 0, skills: 0, leftOut: [] })),
      };
    },
    route(threadId) {
      const found = held.get(threadId);
      return found === undefined ? undefined : offer(SessionService, found.service);
    },
    session,
  };
}
