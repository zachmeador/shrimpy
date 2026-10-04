import { replicatedState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { RoutedServerPresentation } from "@earendil-works/pi-server";
import { Refusal, refuse } from "../../../lib/refusal/index.ts";
import { offer, type Offer } from "../../../lib/testing/index.ts";
import { type Reloaded, type SessionDirectory, SessionService, type SessionView } from "../index.ts";
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
  /** The input clients gave it directly, oldest first. */
  readonly steered: readonly string[];
  /** Make stops be refused with `reason`, as written, or work again with undefined. */
  failStops(reason: string | undefined): void;
}

/**
 * An agent's sessions, scripted by a test: which exist, what each shows, and
 * what clients did to them. It answers the agent API as the agent does, with
 * the same refusal for a thread it has no session for.
 */
export interface ScriptedAgent {
  /** What one connection talks to. Given the connection's presentation, the connection can attach a session. */
  serve(presentation: RoutedServerPresentation): SessionDirectory;
  /** The session behind a thread, for a server that sends a connection that attaches it there: undefined when there is none. */
  route(threadId: string): Offer | undefined;

  /** Make the session behind a thread, idle and empty unless `view` says more. Making it again gives the same session. */
  session(threadId: string, options?: { channelId?: string; view?: SessionView }): ScriptedSession;
  /** The session behind a thread, if the agent has one. */
  find(threadId: string): ScriptedSession | undefined;

  /** How many times a client asked the agent to read its home again. */
  readonly reloads: number;
  /** What the next reloads answer with. Nothing found, to begin with. */
  reloadedWith(result: Reloaded): void;
}

interface Held {
  session: ScriptedSession;
  service: SessionService;
}

export function scriptedAgent(): ScriptedAgent {
  const held = new Map<string, Held>();
  let reloads = 0;
  let reloaded: Reloaded = { soul: false, files: 0, skills: 0, leftOut: [] };
  // The agent says a session has work when it is answering input or has input queued.
  const working = (view: SessionView): boolean => view.status.busy || view.status.queued.length > 0;

  function session(threadId: string, options: { channelId?: string; view?: SessionView } = {}): ScriptedSession {
    const existing = held.get(threadId);
    if (existing !== undefined) return existing.session;

    const state = replicatedState(structuredClone(options.view ?? sessionView()));
    const steered: string[] = [];
    let stops = 0;
    let refusal: string | undefined;
    const made: ScriptedSession = {
      threadId,
      channelId: options.channelId ?? `ch_${threadId.slice(3)}`,
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
      steered,
      failStops(reason) {
        refusal = reason;
      },
    };
    const service: SessionService = {
      state,
      steer(text) {
        steered.push(text);
        return Promise.resolve({ submission: steered.length });
      },
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
    serve(presentation) {
      return {
        list: () =>
          Promise.resolve(
            [...held.values()].map(({ session: each }) => ({
              threadId: each.threadId,
              channelId: each.channelId,
              working: working(each.view),
            })),
          ),
        async attach(threadId, context) {
          if (!held.has(threadId)) refuse(`This agent has no session for thread ${threadId} yet.`);
          await presentation.attachSession(threadId, context);
        },
        detach: (context) => presentation.detachSession(context),
        reload() {
          reloads += 1;
          return Promise.resolve(structuredClone(reloaded));
        },
      };
    },
    route(threadId) {
      const found = held.get(threadId);
      return found === undefined ? undefined : offer(SessionService, found.service);
    },
    session,
    find: (threadId) => held.get(threadId)?.session,
    get reloads() {
      return reloads;
    },
    reloadedWith(result) {
      reloaded = structuredClone(result);
    },
  };
}
