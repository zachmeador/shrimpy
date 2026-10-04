import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { offer, type StandIn, startStandIn, stopAfter } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import type { Registration } from "../../gateway/index.ts";
import { keepRegistered } from "../../gateway/node.ts";
import { type AgentConnection, type AgentEndpoint, connectAgent, SessionDirectory } from "../index.ts";
import { type ScriptedAgent, scriptedAgent } from "./scripted.ts";

export interface StandInAgentOptions {
  /** The agent's name: how the gateway lists it. */
  name: string;
  /** The sessions to serve, when the test made them. By default none. */
  agent?: ScriptedAgent;
  /** The server ID it claims, a random one by default. It is the same each time the agent comes back. */
  serverId?: string;
  /** Register with this machine's gateway, the way an agent does. */
  register?: boolean;
  /** The version it registers with. The version of Shrimpy by default. */
  version?: string;
}

export interface StandInAgent {
  /** Its sessions and how they are scripted. They live through outages. */
  readonly agent: ScriptedAgent;
  readonly name: string;
  readonly serverId: string;
  /** Absolute path of its Unix socket, in the test's runtime directory. */
  readonly socket: string;
  /** What an agent writes to say where it can be reached. */
  readonly endpoint: AgentEndpoint;
  /** What a gateway lists for it. */
  readonly registration: Registration;
  /** How many connections are open right now. */
  connections(): number;
  /** Connect over the socket as a client does. The connection is closed when the test ends. */
  join(): Promise<AgentConnection>;
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
  const agent = options.agent ?? scriptedAgent();
  const serverId = options.serverId ?? randomUUID();
  const listen = (): Promise<StandIn> =>
    startStandIn(t, `agent-${options.name}`, {
      serverId,
      offer: (presentation) => offer(SessionDirectory, agent.serve(presentation)),
      route: (threadId) => agent.route(threadId),
    });

  let listening: StandIn | undefined = await listen();
  const { socket } = listening;
  const endpoint: AgentEndpoint = { serverId, socket, pid: process.pid };
  const registration: Registration = {
    kind: "agent",
    name: options.name,
    ...endpoint,
    version: options.version ?? SHRIMPY_VERSION,
  };
  if (options.register === true) {
    const kept = keepRegistered(registration);
    stopAfter(t, () => kept.stop());
  }

  return {
    agent,
    name: options.name,
    serverId,
    socket,
    endpoint,
    registration,
    connections: () => listening?.connections() ?? 0,
    async join() {
      const transportFactory = createUnixTransportFactory({ path: socket });
      const connection = await connectAgent({ serverId, transportFactory });
      stopAfter(t, () => connection.close());
      return connection;
    },
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
