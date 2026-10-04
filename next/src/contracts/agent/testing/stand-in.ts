import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { offer, type StandIn, startStandIn, stopAfter } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import type { Registration } from "../../gateway/index.ts";
import { keepRegistered } from "../../gateway/node.ts";
import { SessionDirectory } from "../index.ts";
import { type ScriptedAgent, scriptedAgent } from "./scripted.ts";

export interface StandInAgentOptions {
  /** The agent's name: how the gateway lists it. */
  name: string;
  /** Register with this machine's gateway, the way an agent does. */
  register?: boolean;
  /** The version it registers with. The version of Shrimpy by default. */
  version?: string;
}

export interface StandInAgent {
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
 * memory, not the agent's code. It listens in the runtime directory, so the test
 * needs one of its own, and it is closed when the test ends.
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
  if (options.register === true) {
    const registration: Registration = {
      kind: "agent",
      name: options.name,
      serverId,
      socket,
      pid: process.pid,
      version: options.version ?? SHRIMPY_VERSION,
    };
    const kept = keepRegistered(registration);
    stopAfter(t, () => kept.stop());
  }

  return {
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
