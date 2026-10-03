import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isServerId } from "@earendil-works/pi-protocol";
import {
  type RoutedServerServiceHost,
  Server,
  type ServerHost,
  SessionNotFoundError,
} from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import {
  Chat,
  type ChatEndpoint,
  chatEndpointFile,
  ThreadService,
} from "../contracts/chat/index.ts";
import { offerToConnection, offerToRoute } from "../lib/offer/index.ts";
import { namedSocketPath } from "../lib/runtime/index.ts";
import { serveChat } from "./connection.ts";
import { takeChatLock } from "./lock.ts";
import { type ChatDeps, serveThread, threadExists } from "./threads/index.ts";

export interface ChatServer {
  readonly endpoint: ChatEndpoint;
  close(): Promise<void>;
}

/**
 * Serve the chat API on this machine's chat socket, and record where to find
 * it. The socket's lock comes first.
 */
export async function startServer(
  deps: ChatDeps,
  dataDir: string,
  onError: (error: Error) => void,
): Promise<ChatServer> {
  const endpoint: ChatEndpoint = {
    serverId: previousServerId(dataDir) ?? randomUUID(),
    socket: namedSocketPath("chat"),
    pid: process.pid,
  };
  const lock = takeChatLock(endpoint.socket);
  // This process holds the lock, so no other chat server here is listening.
  // The listener replaces a socket left behind by one that died.
  const server = new Server(serverHost(deps), {
    serverId: endpoint.serverId,
    listeners: [createUnixListener({ path: endpoint.socket })],
    onError,
  });
  try {
    await server.start();
    try {
      writeEndpoint(dataDir, endpoint);
    } catch (error) {
      await server.close();
      throw error;
    }
  } catch (error) {
    lock.release();
    throw error;
  }
  return {
    endpoint,
    async close() {
      try {
        await server.close();
      } finally {
        lock.release();
      }
    },
  };
}

function serverHost(deps: ChatDeps): ServerHost {
  const serverServices: RoutedServerServiceHost = {
    attachClient(presentation) {
      const served = serveChat(deps, presentation);
      return offerToConnection(Chat, served.chat, () => served.end());
    },
  };
  return {
    serverServices,
    resolveSession(threadId) {
      if (!threadExists(deps, threadId)) {
        return Promise.reject(new SessionNotFoundError(`Unknown thread: ${threadId}`));
      }
      return Promise.resolve({ id: threadId });
    },
    openSession(metadata) {
      const served = serveThread(deps, metadata.id);
      return Promise.resolve(
        offerToRoute(
          ThreadService,
          { state: served.state },
          { attached: () => served.watch(), closed: () => served.close() },
        ),
      );
    },
  };
}

/** The ID the last chat server here used, so clients reconnecting after a restart find the same one. */
function previousServerId(dataDir: string): string | undefined {
  try {
    const { serverId } = JSON.parse(readFileSync(chatEndpointFile(dataDir), "utf8")) as Partial<ChatEndpoint>;
    return isServerId(serverId) ? serverId : undefined;
  } catch {
    // No endpoint yet, or one that was never finished: start with a new ID.
    return undefined;
  }
}

/** Written whole or not at all, so nobody reads half of it. */
function writeEndpoint(dataDir: string, endpoint: ChatEndpoint): void {
  const file = chatEndpointFile(dataDir);
  mkdirSync(dirname(file), { recursive: true });
  const unfinished = `${file}.${process.pid}`;
  writeFileSync(unfinished, JSON.stringify(endpoint));
  renameSync(unfinished, file);
}
