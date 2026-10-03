/**
 * The Node-only door of the agent contract: reaching an agent on this machine
 * over its Unix socket. Browser code must not import this file.
 */
import { readFileSync } from "node:fs";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { type AgentConnection, connectAgent } from "./connect.ts";
import { type AgentEndpoint, endpointFile } from "./endpoint.ts";

export function readEndpoint(home: string): AgentEndpoint {
  return JSON.parse(readFileSync(endpointFile(home), "utf8")) as AgentEndpoint;
}

/** Connect to the agent that owns `home`. Fails if no agent is running there. */
export function attachLocal(home: string): Promise<AgentConnection> {
  const endpoint = readEndpoint(home);
  return connectAgent({
    serverId: endpoint.serverId,
    transportFactory: createUnixTransportFactory({ path: endpoint.socket }),
  });
}
