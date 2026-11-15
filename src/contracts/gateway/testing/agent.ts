import type { TestContext } from "node:test";
import { createHost, defineFacet, type Host } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { backoff } from "../../../lib/retry/index.ts";
import { stopAfter } from "../../../lib/testing/index.ts";
import { AgentPresence } from "../../agent/index.ts";
import { agent, type Member, type Principal, type Revocation, revokedBy } from "../index.ts";
import { gatewaySocket, keepProgramLinked, newToken } from "../node.ts";

/** A small agent's program, linked to the gateway as an agent's program is. */
export interface TestAgent {
  /** Its host, at `agent({ name })`, which holds the other programs' objects through the gateway as the agent. */
  readonly host: Host<Principal, Revocation>;
  /** The member the gateway welcomed it as. */
  readonly you: Member;
  /** The token it showed, which a client can link with to be the agent too. */
  readonly token: string;
  /** Stop linking, and drop its link at once. */
  stop(): Promise<void>;
}

/**
 * An agent's program called `name`, linked to the gateway on its socket in the
 * test's runtime directory, serving only its presence. A token the gateway
 * doesn't know joins the roster. Rejects with the gateway's refusal if its
 * first hello is turned away. Stopped when the test ends.
 */
export async function linkTestAgent(t: TestContext, name: string, token: string = newToken()): Promise<TestAgent> {
  const host = createHost<Principal, Revocation>({
    address: agent({ name }),
    principal: { kind: "home" },
    revokedBy,
    onError: () => undefined,
  });
  const facet = defineFacet<Principal>((serving) => {
    serving.serve(AgentPresence, () => ({ variant: "present", members: {} }));
  });
  await host.load([{ name: "@shrimpy/test-agent", facet }], BACKGROUND_CONTEXT);
  const stopping = new AbortController();
  let welcome = (_you: Member): void => undefined;
  let refuse = (_error: unknown): void => undefined;
  const welcomed = new Promise<Member>((resolve, reject) => {
    welcome = resolve;
    refuse = reject;
  });
  const linking = keepProgramLinked({
    host,
    place: { path: gatewaySocket() },
    who: () => ({ kind: "agent", name, token }),
    signal: stopping.signal,
    backoff: backoff({ firstMs: 5, maxMs: 50 }),
    onWelcome: (answer) => {
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
    return { host, you: await welcomed, token, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
