import { randomUUID } from "node:crypto";
import {
  type RoutedServerServiceHost,
  Server,
  type ServerHost,
  SessionNotFoundError,
} from "@earendil-works/pi-server";
import { createUnixListener } from "@earendil-works/pi-server/unix";
import { Chat, ThreadService } from "../contracts/chat/index.ts";
import { isClientGone, offerToConnection, offerToRoute } from "../lib/offer/index.ts";
import { serveChat } from "./connection.ts";
import { type ChatDeps, serveThread, threadExists } from "./threads/index.ts";

export interface ChatServer {
  /** The server ID it answers as, which the gateway gives to whoever is let in. */
  readonly serverId: string;
  close(): Promise<void>;
}

/**
 * Serve the chat API on `socket`. The caller holds the socket's lock, so no
 * other chat server here is listening, and the listener replaces a socket left
 * behind by one that died. Nobody is told where the socket is but the gateway,
 * which the caller registers it with: clients reach chat by its name.
 */
export async function startServer(
  deps: ChatDeps,
  socket: string,
  onError: (error: Error) => void,
): Promise<ChatServer> {
  const serverId = randomUUID();
  const server = new Server(serverHost(deps), {
    serverId,
    listeners: [createUnixListener({ path: socket })],
    onError(error) {
      if (!isClientGone(error)) onError(error);
    },
  });
  await server.start();
  return { serverId, close: () => server.close() };
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
