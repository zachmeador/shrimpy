/**
 * Where a running agent is reached by its home's path: the socket in the
 * runtime directory that asks for no ticket, which is how an agent is watched
 * and stopped with no gateway running. Everyone else reaches an agent by its
 * name through the gateway.
 */
export interface AgentEndpoint {
  /** Stays the same across restarts, so a reconnecting client finds the same agent. */
  serverId: string;
  /** Absolute path of the agent's Unix socket for its home. */
  socket: string;
  pid: number;
}

/** The folder of a home where the agent writes its endpoint. */
export const AGENT_RUNTIME_DIR = "runtime";

/** The agent writes its endpoint here once it is listening. */
export function endpointFile(home: string): string {
  return `${home}/${AGENT_RUNTIME_DIR}/endpoint.json`;
}
