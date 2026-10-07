import { DisconnectedError } from "@earendil-works/pi-client";

/** Whether an error says the connection ended: the other program went away, or the link between the two dropped. */
export function isDisconnected(error: unknown): boolean {
  return error instanceof DisconnectedError;
}

/**
 * An error that says a connection ended, which `isDisconnected` knows, for a
 * program that gives up on a connection and wants what waits on it to be told it
 * the way it is told when the other end goes away.
 */
export function disconnected(message: string): Error {
  return new DisconnectedError(message);
}

/**
 * Whether a connection failed because nothing is listening where it went: the
 * socket is gone (ENOENT) or nothing answers on it (ECONNREFUSED). Any other
 * failure, such as a server that answers as someone else, says something more.
 */
export function isNotListening(error: unknown): boolean {
  if (!(error instanceof DisconnectedError)) return false;
  const code = (error.cause as { code?: unknown } | undefined)?.code;
  return code === "ENOENT" || code === "ECONNREFUSED";
}
