/**
 * The Node-only door of the chat contract: reaching the chat server on this
 * machine over its Unix socket. Browser code must not import this file.
 */
import { createUnixTransportFactory } from "@earendil-works/pi-client/unix";
import { type ChatConnection, connectChat } from "./connect.ts";
import type { ChatEndpoint } from "./endpoint.ts";

/**
 * Connect to a chat server on this machine. Fails if none is listening at the
 * endpoint. Aborting `signal` gives up on a server that is not answering.
 */
export function connectLocal(endpoint: ChatEndpoint, options: { signal?: AbortSignal } = {}): Promise<ChatConnection> {
  return connectChat({
    serverId: endpoint.serverId,
    transportFactory: createUnixTransportFactory({ path: endpoint.socket }),
    signal: options.signal,
  });
}
