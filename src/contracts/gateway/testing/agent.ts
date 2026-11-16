import type { TestContext } from "node:test";
import { constant, createHost, defineFacet, type Host, remote, str, unknown } from "@earendil-works/chord";
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
  hostAddress: ({ agent: name }) => agent({ name }),
  variants: { only: { state: { caller: unknown() } } },
});

export interface TestAgentOptions {
  /** The token it shows: a new one, which joins the roster, unless the test gives one. */
  token?: string;
  /** Where the gateway is: its socket in the test's runtime directory, unless the test gives its entry with the fingerprint of its key. */
  place?: DialPlace;
}

/** A small agent's program, linked to the gateway as an agent's program is. */
export interface TestAgent {
  /** Its host, at `agent({ name })`, which holds the other programs' objects through the gateway as the agent. */
  readonly host: Host<Principal, Revocation>;
  /** The member the gateway first welcomed it as. */
  readonly you: Member;
  /** The token it showed, which a client can link with to be the agent too. */
  readonly token: string;
  /** Every answer the gateway welcomed it with, the first and one each time it linked again. */
  readonly welcomes: Welcome[];
  /** Stop linking, and drop its link at once. */
  stop(): Promise<void>;
}

/**
 * An agent's program called `name`, kept linked to the gateway as a program is,
 * serving its presence and `Echo`. A token the gateway doesn't know joins the
 * roster. Rejects with the gateway's refusal if its first hello is turned away.
 * Stopped when the test ends.
 */
export async function linkTestAgent(t: TestContext, name: string, options: TestAgentOptions = {}): Promise<TestAgent> {
  const token = options.token ?? newToken();
  const host = createHost<Principal, Revocation>({
    address: agent({ name }),
    principal: { kind: "home" },
    revokedBy,
    onError: () => undefined,
  });
  const facet = defineFacet<Principal>((serving) => {
    serving.serve(AgentPresence, () => ({ variant: "present", members: {} }));
    serving.serve(Echo, (_params, caller) => ({ variant: "only", members: { caller: constant(caller) } }));
  });
  await host.load([{ name: "@shrimpy/test-agent", facet }], BACKGROUND_CONTEXT);
  const stopping = new AbortController();
  const welcomes: Welcome[] = [];
  let welcome = (_you: Member): void => undefined;
  let refuse = (_error: unknown): void => undefined;
  const welcomed = new Promise<Member>((resolve, reject) => {
    welcome = resolve;
    refuse = reject;
  });
  const linking = keepLinked({
    host,
    place: options.place ?? { path: gatewaySocket() },
    who: () => ({ kind: "agent", name, token }),
    signal: stopping.signal,
    backoff: backoff({ firstMs: 5, maxMs: 50 }),
    onWelcome: (answer) => {
      welcomes.push(answer);
      if (answer.you !== null) welcome(answer.you);
    },
    onError: (error) => refuse(error),
  });
  let stopped: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    stopped ??= (async () => {
      stopping.abort();
      await linking;
      await host.close(BACKGROUND_CONTEXT);
    })();
    return stopped;
  };
  stopAfter(t, stop);
  try {
    return { host, you: await welcomed, token, welcomes, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
