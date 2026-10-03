import { type Lock, takeLock } from "../lib/lock/index.ts";

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
 * One chat server per socket, with the lock in a file beside the socket. The
 * store's own lock keeps two servers off one data directory; this keeps them
 * off one socket when their data directories differ. Take it before listening:
 * servers that start at the same moment cannot both get through, and a killed
 * server leaves nothing to clean up.
 */
export function takeChatLock(socket: string): Lock {
  return takeLock(`${socket}.lock`, (cause) => new ChatRunningError(socket, { cause }));
}
