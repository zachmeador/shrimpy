import { replicatedState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { RoutedServerPresentation } from "@earendil-works/pi-server";
import { Refusal, refuse } from "../../../lib/refusal/index.ts";
import { offer, type Offer } from "../../../lib/testing/index.ts";
import {
  type Member,
  type SessionDirectory,
  type SessionPlace,
  SessionService,
  type SessionView,
} from "../index.ts";
import { sessionView } from "./views.ts";

/** One session of a scripted agent: what its clients see, and what they did to it. */
export interface ScriptedSession {
  /** The session's address at the agent: a thread's ID, or `trigger:` and a trigger's name. */
  readonly address: string;
  /** The thread the session is behind, which is its address, or null for a trigger's own session. */
  readonly threadId: string | null;
  readonly channelId: string | null;
  /** A copy of what clients of the session see now. */
  readonly view: SessionView;
  /** Show clients this view. */
  show(view: SessionView): void;
  /** Show clients the view after `change` has edited a copy of the current one. */
  update(change: (view: SessionView) => void): void;
  /** How many times a client stopped the session's work. */
  readonly stops: number;
  /** The text clients steered into the session, in order. */
  readonly steers: string[];
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
  /** The session at an address, for a server that sends a connection that attaches it there: undefined when there is none. */
  route(address: string): Offer | undefined;

  /**
   * Make the session at an address, which is a thread's ID or `trigger:` and a
   * trigger's name, idle and empty unless `view` says more, and as placed as
   * `place` says: the agent lists it with no place otherwise. Making it again
   * gives the same session.
   */
  session(address: string, options?: { view?: SessionView; place?: SessionPlace }): ScriptedSession;
  /** How many times clients have asked which sessions the agent has. */
  readonly listings: number;
}

interface Held {
  session: ScriptedSession;
  service: SessionService;
  place: SessionPlace | null;
}

const noTrigger = (name: string): Refusal => new Refusal(`This agent has no trigger called ${name}.`);

export function scriptedAgent(): ScriptedAgent {
  const held = new Map<string, Held>();
  let listings = 0;
  // The agent says a session has work when it is answering input or has input queued.
  const working = (view: SessionView): boolean => view.status.busy || view.status.queued.length > 0;

  function session(address: string, options: { view?: SessionView; place?: SessionPlace } = {}): ScriptedSession {
    const existing = held.get(address);
    if (existing !== undefined) return existing.session;

    const state = replicatedState(structuredClone(options.view ?? sessionView()));
    const steers: string[] = [];
    let stops = 0;
    const behindThread = !address.startsWith("trigger:");
    const made: ScriptedSession = {
      address,
      threadId: behindThread ? address : null,
      channelId: behindThread ? `ch_${address.slice(3)}` : null,
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
      get steers() {
        return [...steers];
      },
    };
    const service: SessionService = {
      state,
      steer(text) {
        steers.push(text);
        return Promise.resolve({ submission: 1 });
      },
      wait: () => Promise.reject(new Error("A scripted agent does not settle input.")),
      stop() {
        stops += 1;
        return Promise.resolve();
      },
    };
    held.set(address, { session: made, service, place: options.place ?? null });
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
          admitted(() => {
            listings += 1;
            return Promise.resolve(
              [...held.values()].map(({ session: each, place }) => ({
                id: each.address,
                threadId: each.threadId,
                channelId: each.channelId,
                place,
                working: working(each.view),
              })),
            );
          }),
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
        reload: () =>
          admitted(() =>
            Promise.resolve({
              soul: false,
              files: 0,
              skills: 0,
              triggers: 0,
              model: { provider: "local", id: "test-model" },
              changedFrom: null,
              leftOut: [],
            }),
          ),
      };
    },
    route(address) {
      const found = held.get(address);
      return found === undefined ? undefined : offer(SessionService, found.service);
    },
    session,
    get listings() {
      return listings;
    },
  };
}
