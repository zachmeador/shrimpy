import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createRemoteServiceEndpoint, RemoteServiceProvider } from "@earendil-works/chord";
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
import { namedSocketPath } from "../lib/runtime/index.ts";
import { serveChat } from "./connection.ts";
import { type ChatDeps, serveThread, threadExists } from "./threads/index.ts";

export interface ChatServer {
  readonly endpoint: ChatEndpoint;
  close(): Promise<void>;
}

/** Serve the chat API on this machine's chat socket, and record where to find it. */
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
  // The listener refuses a socket another chat server is listening on, and
  // replaces one left behind by a server that died.
  const server = new Server(serverHost(deps), {
    serverId: endpoint.serverId,
    listeners: [createUnixListener({ path: endpoint.socket })],
    onError,
  });
  await server.start();
  try {
    writeEndpoint(dataDir, endpoint);
  } catch (error) {
    await server.close();
    throw error;
  }
  return { endpoint, close: () => server.close() };
}

function serverHost(deps: ChatDeps): ServerHost {
  const serverServices: RoutedServerServiceHost = {
    attachClient(presentation) {
      const served = serveChat(deps, presentation);
      const provider = new RemoteServiceProvider([{ service: Chat, mode: "singleton" }]);
      provider.provide(Chat, served.chat);
      const remote = createRemoteServiceEndpoint(provider);
      return {
        invokeService: (call, publish, context) => remote.invoke(call, publish, context),
        release() {
          remote.dispose();
          provider.dispose();
          served.end();
        },
      };
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
      const provider = new RemoteServiceProvider([{ service: ThreadService, mode: "singleton" }]);
      provider.provide(ThreadService, { state: served.state });
      return Promise.resolve({
        attachClient() {
          const stopWatching = served.watch();
          const remote = createRemoteServiceEndpoint(provider);
          return {
            invokeService: (call, publish, context) => remote.invoke(call, publish, context),
            release() {
              remote.dispose();
              stopWatching();
            },
          };
        },
        close() {
          served.close();
          provider.dispose();
          return Promise.resolve();
        },
      });
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
