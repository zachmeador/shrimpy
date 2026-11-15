import type { TestContext } from "node:test";
import { constant, createHost, defineFacet, type Host, remote, str, unknown } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { AgentPresence } from "../../contracts/agent/index.ts";
import { agent, type Principal, type Revocation, revokedBy, type Welcome } from "../../contracts/gateway/index.ts";
import { type GatewayPlace, keepProgramLinked } from "../../contracts/gateway/node.ts";
import { stopAfter } from "../../lib/testing/index.ts";

/** An object at an agent that shows whom a request for it reached the agent as. */
export const Echo = remote("shrimpy.test.echo", {
  version: 1,
  params: { agent: str() },
  hostAddress: ({ agent: name }) => agent({ name }),
  variants: { only: { state: { caller: unknown() } } },
});

export interface TestAgentOptions {
  /** The gateway's own socket, or its entry, with the fingerprint of its key. */
  readonly place: GatewayPlace;
  readonly name: string;
  readonly token: string;
}

export interface TestAgent {
  readonly host: Host<Principal, Revocation>;
  /** Every answer the gateway welcomed it with. */
  readonly welcomes: Welcome[];
  /** Every error a hello failed with, refusals among them. */
  readonly errors: unknown[];
  /** Stop linking, and drop the link at once. */
  stop(): Promise<void>;
}

/**
 * An agent's program in this process, at `agent({ name })`, kept linked to the
 * gateway as a program is, serving its presence and `Echo`. Stopped when the
 * test ends.
 */
export async function startTestAgent(t: TestContext, options: TestAgentOptions): Promise<TestAgent> {
  const host = createHost<Principal, Revocation>({
    address: agent({ name: options.name }),
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
  const errors: unknown[] = [];
  const linking = keepProgramLinked({
    host,
    place: options.place,
    who: () => ({ kind: "agent", name: options.name, token: options.token }),
    signal: stopping.signal,
    onWelcome: (answer) => welcomes.push(answer),
    onError: (error) => errors.push(error),
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
  return { host, welcomes, errors, stop };
}
