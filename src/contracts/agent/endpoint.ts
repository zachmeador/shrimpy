/**
 * Where a running agent is reached by its home's path: its home's own socket,
 * which asks for no token and stamps whoever links there `home`, and the name it
 * answers to, which its objects' `agent` param takes. That is how an agent is
 * watched and stopped with no gateway running. Everyone else reaches an agent
 * by its name through the gateway.
 */
export interface AgentEndpoint {
  /** Absolute path of the home's own socket. */
  socket: string;
  /** The name the agent answers to: its objects are at `agent({ name })`. */
  name: string;
  pid: number;
}

/** The folder of a home where the agent writes its endpoint. */
export const AGENT_RUNTIME_DIR = "runtime";

/** The agent writes its endpoint here once it is listening. */
export function endpointFile(home: string): string {
  return `${home}/${AGENT_RUNTIME_DIR}/endpoint.json`;
}
