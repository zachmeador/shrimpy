/**
 * The Node-only door of the chat contract: reaching the chat server on this
 * machine over its Unix socket. Browser code must not import this file.
 */
import { readFileSync } from "node:fs";
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { type ChatConnection, connectChat } from "./connect.ts";
import { type ChatEndpoint, chatEndpointFile } from "./endpoint.ts";

/** Where the chat server that keeps `dataDir` says it can be reached. Fails if none ever ran there. */
export function readChatEndpoint(dataDir: string): ChatEndpoint {
  return JSON.parse(readFileSync(chatEndpointFile(dataDir), "utf8")) as ChatEndpoint;
}

/** Connect to a chat server on this machine. Fails if none is listening at the endpoint. */
export function connectLocal(endpoint: ChatEndpoint): Promise<ChatConnection> {
  return connectChat({
    serverId: endpoint.serverId,
    transportFactory: createUnixTransportFactory({ path: endpoint.socket }),
  });
}
