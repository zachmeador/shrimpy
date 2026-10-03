import { DatabaseSync } from "node:sqlite";

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

export interface GatewayLock {
  release(): void;
}

/**
 * One gateway per socket, held by the OS: an exclusive lock on a SQLite file
 * beside the socket. The kernel drops it when the process dies, so a killed
 * gateway leaves nothing to clean up, and gateways that start at the same
 * moment cannot both get through. Take it before touching the socket.
 */
export function takeGatewayLock(socket: string): GatewayLock {
  const db = new DatabaseSync(`${socket}.lock`);
  try {
    db.exec("PRAGMA locking_mode = EXCLUSIVE");
    db.exec("BEGIN EXCLUSIVE");
  } catch (error) {
    db.close();
    throw new GatewayRunningError(socket, { cause: error });
  }
  return { release: () => db.close() };
}
