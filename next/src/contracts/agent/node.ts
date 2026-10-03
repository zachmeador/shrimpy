/**
 * The Node-only door of the agent contract: reaching an agent on this machine
 * over its Unix socket. Browser code must not import this file.
 */
import { readFileSync } from "node:fs";
import { DisconnectedError } from "@earendil-works/pi-client";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { type AgentConnection, connectAgent } from "./connect.ts";
import { type AgentEndpoint, endpointFile } from "./endpoint.ts";

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

/** Connect to the agent that owns `home`. Fails with `AgentNotRunningError` if none is listening. */
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

/** The socket is gone (ENOENT) or nothing answers on it (ECONNREFUSED). */
function isNotListening(error: unknown): boolean {
  if (!(error instanceof DisconnectedError)) return false;
  const code = (error.cause as NodeJS.ErrnoException | undefined)?.code;
  return code === "ENOENT" || code === "ECONNREFUSED";
}
