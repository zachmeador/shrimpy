/**
 * The chat server program: one process that keeps channels, threads, the log of
 * events and the messages they add up to in its own store and serves the chat
 * API for everyone on this machine. Other programs reach chat only through
 * `contracts/chat`, by its name through the gateway; they never import this
 * program's modules. It must not know what a member does with an event, or
 * anything about an agent's sessions. Of the gateway it knows only its
 * contract: it registers there with the one socket it listens on, which only
 * the gateway is told, and asks it who a ticket belongs to, over the one
 * connection it keeps.
 */
import { type KeptRegistration, keepRegistered } from "../contracts/gateway/node.ts";
import type { Backoff } from "../lib/retry/index.ts";
import { namedSocketPath } from "../lib/runtime/node.ts";
import { SHRIMPY_VERSION } from "../lib/version/index.ts";
import { identityFromGateway } from "./identity/index.ts";
import { takeChatLock } from "./lock.ts";
import { openStore } from "./store/index.ts";
import { startServer } from "./server.ts";
import { type ChatDeps, createWorkingMarks } from "./threads/index.ts";

export { ChatRunningError } from "./lock.ts";

export interface ChatOptions {
  /** Where the chat server keeps its store and its endpoint. */
  dataDir: string;
  /** The pauses between attempts to reach the gateway. Tests shorten them. */
  backoff?: Backoff;
}

export interface RunningChat {
  /** The Unix socket it listens on, which it tells the gateway and no one else. */
  readonly socket: string;
  /** The server ID it answers as, which the gateway gives to whoever is let in. */
  readonly serverId: string;
  close(): Promise<void>;
}

/**
 * Take this machine's chat socket, then the data directory, then start
 * serving. The socket's lock comes first, so a second chat server on this
 * machine is refused with `ChatRunningError` before it touches its data
 * directory. The store's own lock still guards a data directory that two
 * servers reach through different sockets, and refuses with `StoreOwnedError`.
 *
 * The chat server starts whether or not a gateway is running. It registers
 * when it finds one, and again each time the gateway comes back. Without a
 * gateway nobody can come in, because the gateway is the only one who can say
 * who they are, and they are told so.
 */
export async function startChat(options: ChatOptions): Promise<RunningChat> {
  const socket = namedSocketPath("chat");
  const lock = takeChatLock(socket);
  try {
    const chat = await serveStore(options, socket);
    return {
      socket,
      serverId: chat.serverId,
      async close() {
        try {
          await chat.close();
        } finally {
          lock.release();
        }
      },
    };
  } catch (error) {
    lock.release();
    throw error;
  }
}

async function serveStore(options: ChatOptions, socket: string): Promise<RunningChat> {
  const onError = (error: Error): void => console.error("[chat]", error.message);
  const store = openStore(options.dataDir, { onError });
  try {
    // The connection to the gateway is kept once the server is listening, and the server asks it through here.
    const gateway: { kept?: KeptRegistration } = {};
    const deps: ChatDeps = {
      store,
      working: createWorkingMarks({ onError }),
      identity: identityFromGateway(() => gateway.kept?.current()),
      now: () => Date.now(),
    };
    const server = await startServer(deps, socket, onError);
    const kept = keepRegistered(
      { kind: "chat", serverId: server.serverId, socket, version: SHRIMPY_VERSION },
      {
        backoff: options.backoff,
        onError: (error) => onError(new Error(`Could not register with the gateway: ${error.message}`)),
      },
    );
    gateway.kept = kept;
    return {
      socket,
      serverId: server.serverId,
      async close() {
        try {
          // The registration goes first, so the gateway stops pointing at a server that is closing.
          await kept.stop();
        } finally {
          try {
            await server.close();
          } finally {
            store.close();
          }
        }
      },
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
