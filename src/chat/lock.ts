import { type Lock, takeLock } from "../lib/lock/node.ts";

/** Another chat server is already serving this machine's socket. */
export class ChatRunningError extends Error {
  readonly socket: string;

  constructor(socket: string, options?: ErrorOptions) {
    super(
      `A chat server is already running on ${socket}. Use that one, or stop it before starting another.`,
      options,
    );
    this.name = "ChatRunningError";
    this.socket = socket;
  }
}

/**
 * One chat server per socket, with the lock in a file beside the socket. Take
 * it first, before the data directory is touched: a server that is refused has
 * made nothing, servers that start at the same moment cannot both get through,
 * and a killed server leaves nothing to clean up. The store's own lock is the
 * guard for two servers that share a data directory but not a socket.
 */
export function takeChatLock(socket: string): Lock {
  return takeLock(`${socket}.lock`, (cause) => new ChatRunningError(socket, { cause }));
}
