import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { backoff } from "../../../lib/retry/index.ts";
import { offer, type StandIn, startStandIn, stopAfter } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import type { Joined } from "../../gateway/index.ts";
import { keepRegistered } from "../../gateway/node.ts";
import { SessionDirectory } from "../index.ts";
import { type ScriptedAgent, scriptedAgent } from "./scripted.ts";

export interface StandInAgentOptions {
  /** The agent's name: how the roster lists it. */
  name: string;
}

export interface StandInAgent {
  /** Who the agent is on the roster, and the token that makes it so. It joins when it first reaches the gateway, so this settles once the gateway is there. */
  readonly joined: Promise<Joined>;
  /** Its sessions and how they are scripted. They live through outages. */
  readonly agent: ScriptedAgent;
  /** How many connections are open right now. */
  connections(): number;
  /** Stop listening and cut every connection, like an agent that went away. Its sessions stay. */
  outage(): Promise<void>;
  /** Listen again where it was, with the same server ID, like an agent that came back. */
  recover(): Promise<void>;
}

/**
 * An agent's API as a real server on a real socket, for tests of whatever
 * watches and stops an agent's sessions. It answers with scripted sessions in
 * memory, not the agent's code, but it is a member of the real gateway's roster
 * and registered there the way an agent is. It listens in the runtime
 * directory, so the test needs one of its own and a gateway running, and it is
 * closed when the test ends.
 */
export async function startStandInAgent(t: TestContext, options: StandInAgentOptions): Promise<StandInAgent> {
  const agent = scriptedAgent();
  const serverId = randomUUID();
  const listen = (): Promise<StandIn> =>
    startStandIn(t, `agent-${options.name}`, {
      serverId,
      offer: (presentation) => offer(SessionDirectory, agent.serve(presentation)),
      route: (threadId) => agent.route(threadId),
    });

  let listening: StandIn | undefined = await listen();
  const { socket } = listening;

  // The agent joins the first time it connects, and signs in with its token each time after.
  let membership: Joined | undefined;
  let resolveJoined: (joined: Joined) => void = () => undefined;
  const joined = new Promise<Joined>((resolve) => {
    resolveJoined = resolve;
  });
  const kept = keepRegistered(
    { kind: "agent", serverId, socket, pid: process.pid, version: SHRIMPY_VERSION },
    {
      backoff: backoff({ firstMs: 5, maxMs: 20 }),
      async identify(gateway) {
        if (membership === undefined) {
          membership = await gateway.join(options.name);
          resolveJoined(membership);
        } else {
          await gateway.signIn(membership.token, options.name);
        }
      },
    },
  );
  stopAfter(t, () => kept.stop());

  return {
    joined,
    agent,
    connections: () => listening?.connections() ?? 0,
    async outage() {
      const stopped = listening;
      listening = undefined;
      await stopped?.close();
    },
    async recover() {
      listening ??= await listen();
    },
  };
}
