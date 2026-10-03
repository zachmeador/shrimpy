import { type Lock, takeLock } from "../lib/lock/index.ts";

/** Another gateway is already serving this machine's socket. */
export class GatewayRunningError extends Error {
  readonly socket: string;

  constructor(socket: string, options?: ErrorOptions) {
    super(
      `A gateway is already running on ${socket}. Use that one, or stop it before starting another.`,
      options,
    );
    this.name = "GatewayRunningError";
    this.socket = socket;
  }
}

/**
 * One gateway per socket, with the lock in a file beside the socket. Take it
 * before touching the socket: gateways that start at the same moment cannot
 * both get through, and a killed gateway leaves nothing to clean up.
 */
export function takeGatewayLock(socket: string): Lock {
  return takeLock(`${socket}.lock`, (cause) => new GatewayRunningError(socket, { cause }));
}
