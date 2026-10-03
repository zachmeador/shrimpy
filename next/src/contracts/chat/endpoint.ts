/** Where a running chat server can be reached on its own machine. */
export interface ChatEndpoint {
  /** Stays the same across restarts, so a reconnecting client finds the same chat server. */
  serverId: string;
  /** Absolute path of the chat server's Unix socket. */
  socket: string;
  pid: number;
}

/** The chat server writes its endpoint here once it is listening. */
export function chatEndpointFile(dataDir: string): string {
  return `${dataDir}/runtime/endpoint.json`;
}
