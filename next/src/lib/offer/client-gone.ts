/**
 * Whether a server's error only says that a client went away: something was
 * written to it after it left (EPIPE), or it left without reading what it was
 * sent (ECONNRESET). A client may drop its connection at any moment, and the
 * server lets go of what that connection held, so there is nothing to report.
 */
export function isClientGone(error: unknown): boolean {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  return code === "EPIPE" || code === "ECONNRESET";
}
