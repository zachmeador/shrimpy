/**
 * The Node-only door of the agent contract: reaching the agent of a home by
 * the home's path, over the agent's socket for it, and reading and keeping the
 * membership the home holds. Browser code must not import this file.
 */
import { readFileSync } from "node:fs";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { isNotListening } from "../../lib/connection/index.ts";
import { type AgentConnection, connectAgent } from "./connect.ts";
import { type AgentEndpoint, endpointFile } from "./endpoint.ts";

export { readMembership, saveMembership } from "./membership.node.ts";

/** Nothing is listening for the agent of a home. */
export class AgentNotRunningError extends Error {
  constructor(home: string, options?: ErrorOptions) {
    super(`No agent is running at ${home}.`, options);
    this.name = "AgentNotRunningError";
  }
}

/**
 * Where the agent that owns `home` last said it could be reached, or undefined
 * if none ever has. The file stays after the agent stops, so the endpoint may
 * be stale: only a connection shows that an agent is there.
 */
export function readEndpoint(home: string): AgentEndpoint | undefined {
  try {
    return JSON.parse(readFileSync(endpointFile(home), "utf8")) as AgentEndpoint;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/**
 * Connect straight to the agent that owns `home`, by the home's path, with no
 * gateway and no ticket. Fails with `AgentNotRunningError` if none is listening.
 */
export async function attachLocal(home: string): Promise<AgentConnection> {
  const endpoint = readEndpoint(home);
  if (endpoint === undefined) throw new AgentNotRunningError(home);
  try {
    return await connectAgent({
      serverId: endpoint.serverId,
      transportFactory: createUnixTransportFactory({ path: endpoint.socket }),
    });
  } catch (error) {
    if (isNotListening(error)) throw new AgentNotRunningError(home, { cause: error });
    throw error;
  }
}
