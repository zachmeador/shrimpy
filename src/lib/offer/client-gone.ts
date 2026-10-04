/**
 * What Pi says when it writes to a connection whose client has left. Pi gives
 * these no code, so the words are what there is to go by; it is pinned to an
 * exact version, and a test holds these to what it says.
 */
const LEFT_BEFORE_THE_WRITE = new Set(["Unix connection is closed", "Unix connection closed during write"]);

/**
 * Whether a server's error only says that a client went away: something was
 * written to it after it left (EPIPE, or Pi's own word that the connection is
 * closed), or it left without reading what it was sent (ECONNRESET). A client
 * may drop its connection at any moment, and the server lets go of what that
 * connection held, so there is nothing to report.
 */
export function isClientGone(error: unknown): boolean {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  return code === "EPIPE" || code === "ECONNRESET" || (typeof message === "string" && LEFT_BEFORE_THE_WRITE.has(message));
}
