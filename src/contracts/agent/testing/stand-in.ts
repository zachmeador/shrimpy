import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { isRefusal, refuse } from "../../../lib/refusal/index.ts";
import { backoff } from "../../../lib/retry/index.ts";
import { offer, type StandIn, startStandIn, stopAfter } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import { keepRegistered, type KeptRegistration, newToken } from "../../gateway/node.ts";
import { type Member, SessionDirectory } from "../index.ts";
import { type ScriptedAgent, scriptedAgent } from "./scripted.ts";

export interface StandInAgentOptions {
  /** The agent's name: how the roster lists it. */
  name: string;
}

export interface StandInAgent {
  /** Who the agent is on the roster, and the token that makes it so. It joins when it first reaches the gateway, so this settles once the gateway is there. */
  readonly joined: Promise<{ member: Member; token: string }>;
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
  const registered: { kept?: KeptRegistration } = {};
  // The stand-in lets people in the way an agent does: the gateway says whose a ticket is.
  const whose = async (ticket: string): Promise<Member> => {
    const gateway = registered.kept?.current() ?? refuse("The stand-in agent can't reach the gateway.", "service_not_allowed");
    const { id, kind, name } = await gateway.redeem(ticket).catch((error: unknown) => {
      if (isRefusal(error)) refuse(error.message);
      throw error;
    });
    return { id, kind, name };
  };
  const listen = (): Promise<StandIn> =>
    startStandIn(t, `agent-${options.name}`, {
      serverId,
      offer: (presentation) => offer(SessionDirectory, agent.serve(presentation, whose)),
      route: (threadId) => agent.route(threadId),
    });

  let listening: StandIn | undefined = await listen();
  const { socket } = listening;

  // The agent joins the first time it connects, and signs in with its token each time after.
  const token = newToken();
  let member: Member | undefined;
  let resolveJoined: (joined: { member: Member; token: string }) => void = () => undefined;
  const joined = new Promise<{ member: Member; token: string }>((resolve) => {
    resolveJoined = resolve;
  });
  const kept = keepRegistered(
    { kind: "agent", serverId, socket, version: SHRIMPY_VERSION },
    {
      backoff: backoff({ firstMs: 5, maxMs: 20 }),
      async signIn(gateway) {
        if (member === undefined) {
          member = await gateway.join(options.name, token);
          resolveJoined({ member, token });
        } else {
          await gateway.signIn(token, options.name);
        }
      },
    },
  );
  registered.kept = kept;
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
