import type { TestContext } from "node:test";
import { constant, createHost, defineFacet, type Facet, type Host, remote, str, unknown } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { DialPlace } from "../../../lib/link/node.ts";
import { backoff } from "../../../lib/retry/index.ts";
import { stopAfter } from "../../../lib/testing/index.ts";
import { AgentPresence } from "../../agent/index.ts";
import { agent, type Member, type Principal, type Revocation, revokedBy, type Welcome } from "../index.ts";
import { gatewaySocket, keepLinked, newToken } from "../node.ts";

/** An object at an agent that shows whom a request for it reached the agent as. */
export const Echo = remote("shrimpy.test.echo", {
  version: 1,
  params: { agent: str() },
  hostAddress: ({ agent: id }) => agent({ id }),
  variants: { only: { state: { caller: unknown() } } },
});

export interface TestAgentOptions {
  /** The token it shows: a new one, which joins the roster, unless the test gives one. */
  token?: string;
  /** The roster ID it says it last belonged to, or null when joining anew. */
  roster?: string | null;
  /** Where the gateway is: its socket in the test's runtime directory, unless the test gives its entry with the fingerprint of its key. */
  place?: DialPlace;
  /** More that it serves, as a stand-in for an agent's program of another build serves its own objects. */
  serving?: Facet<Principal>;
}

/** A small agent's program, linked to the gateway as an agent's program is. */
export interface TestAgent {
  /** Its host, at `agent({ id })`, which holds the other programs' objects through the gateway as the agent. */
  readonly host: Host<Principal, Revocation>;
  /** The member the gateway first welcomed it as. */
  readonly you: Member;
  /** The ID of the roster it joined, as the first welcome gave it. */
  readonly roster: string | null;
  /** The token it showed, which a client can link with to be the agent too. */
  readonly token: string;
  /** Every answer the gateway welcomed it with, the first and one each time it linked again. */
  readonly welcomes: Welcome[];
  /** Stop linking, and drop its link at once. */
  stop(): Promise<void>;
}

/**
 * The host of a small agent's program whose member ID is `id`, at `agent({ id })`,
 * loaded with what it serves: its presence and `Echo`, and whatever `serving`
 * adds. Whoever makes it links it to the gateway and closes it.
 */
export async function testAgentHost(id: string, serving?: Facet<Principal>): Promise<Host<Principal, Revocation>> {
  const host = createHost<Principal, Revocation>({
    address: agent({ id }),
    principal: { kind: "home" },
    revokedBy,
    onError: () => undefined,
  });
  const facet = defineFacet<Principal>((serving) => {
    serving.serve(AgentPresence, () => ({ variant: "present", members: {} }));
    serving.serve(Echo, (_params, caller) => ({ variant: "only", members: { caller: constant(caller) } }));
  });
  const more = serving === undefined ? [] : [{ name: "@shrimpy/test-agent-serving", facet: serving }];
  await host.load([{ name: "@shrimpy/test-agent", facet }, ...more], BACKGROUND_CONTEXT);
  return host;
}

/**
 * An agent's program called `name`, kept linked to the gateway as a program is,
 * serving its presence and `Echo`. A token the gateway doesn't know joins the
 * roster. Rejects with the gateway's refusal if its first hello is turned away.
 * Stopped when the test ends.
 */
export async function linkTestAgent(t: TestContext, name: string, options: TestAgentOptions = {}): Promise<TestAgent> {
  const token = options.token ?? newToken();
  let rosterId = options.roster ?? null;
  let currentHost: Host<Principal, Revocation> | undefined;
  let currentId: string | undefined;
  const stopping = new AbortController();
  const welcomes: Welcome[] = [];
  let welcome = (_answer: Welcome): void => undefined;
  let refuse = (_error: unknown): void => undefined;
  const welcomed = new Promise<Welcome>((resolve, reject) => {
    welcome = resolve;
    refuse = reject;
  });
  const linking = keepLinked({
    host: async (answer) => {
      if (answer.you === null) throw new Error("The gateway welcomed an agent as nobody.");
      if (currentHost === undefined || currentId !== answer.you.id) {
        const previous = currentHost;
        currentHost = await testAgentHost(answer.you.id, options.serving);
        currentId = answer.you.id;
        await previous?.close(BACKGROUND_CONTEXT);
      }
      return currentHost;
    },
    place: options.place ?? { path: gatewaySocket() },
    who: () => ({ kind: "agent", name, token, roster: rosterId, home: `/home/${name}` }),
    signal: stopping.signal,
    backoff: backoff({ firstMs: 5, maxMs: 50 }),
    onWelcome: (answer) => {
      welcomes.push(answer);
      if (answer.roster !== null) rosterId = answer.roster;
      if (answer.you !== null) welcome(answer);
    },
    onError: (error) => refuse(error),
  });
  let stopped: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopped ??= (async () => {
      stopping.abort();
      await linking;
      await currentHost?.close(BACKGROUND_CONTEXT);
    })();
    return stopped;
  };
  stopAfter(t, stop);
  try {
    const first = await welcomed;
    if (first.you === null || currentHost === undefined) throw new Error("The gateway welcomed an agent as nobody.");
    return { host: currentHost, you: first.you, roster: first.roster, token, welcomes, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
