/**
 * The agent address served on a home's own socket (`agent({ id: HOME_AGENT })`),
 * apart from the agent's member ID on a gateway's roster so a home's socket
 * works before it has joined any gateway and while the gateway is down.
 */
export const HOME_AGENT = "home";

/**
 * Where a running agent is reached by its home's path: its home's own socket,
 * which asks for no token and stamps whoever links there `home`. That is how an
 * agent is watched and stopped with no gateway running. Everyone else reaches
 * an agent by its member ID through the gateway.
 */
export interface AgentEndpoint {
  /** Absolute path of the home's own socket. */
  socket: string;
  /** The name from agent.json when the agent started. */
  name: string;
  pid: number;
}

/** The folder of a home that holds the agent's disposable files, such as its endpoint. */
export const AGENT_RUNTIME_DIR = "state/runtime";

/** The agent writes its endpoint here once it is listening. */
export function endpointFile(home: string): string {
  return `${home}/${AGENT_RUNTIME_DIR}/endpoint.json`;
}
