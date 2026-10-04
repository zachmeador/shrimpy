/** Where a running agent can be reached on its own machine. */
export interface AgentEndpoint {
  /** Stays the same across restarts, so a reconnecting client finds the same agent. */
  serverId: string;
  /** Absolute path of the agent's Unix socket. */
  socket: string;
  pid: number;
}

/** The folder of a home where the agent writes its endpoint. */
export const AGENT_RUNTIME_DIR = "runtime";

/** The agent writes its endpoint here once it is listening. */
export function endpointFile(home: string): string {
  return `${home}/${AGENT_RUNTIME_DIR}/endpoint.json`;
}
