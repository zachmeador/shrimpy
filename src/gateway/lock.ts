import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { type Lock, LockHeldError, takeLock } from "../lib/lock/node.ts";

/** Another gateway is already serving this machine's socket. */
export class GatewayRunningError extends LockHeldError {}

/**
 * One gateway per socket, with the lock in a file beside the socket. Take it
 * before touching the socket: gateways that start at the same moment cannot
 * both get through, and a killed gateway leaves nothing to clean up.
 */
export function takeGatewayLock(socket: string): Lock {
  const words = `A gateway is already running on ${socket}. Use that one, or stop it before starting another.`;
  return takeLock(`${socket}.lock`, (cause) => new GatewayRunningError(words, { cause }));
}

/**
 * One gateway per data directory, with the lock in its `runtime/`. Take it
 * before anything there is read or made: the roster, the key and the addresses
 * kept are written by the gateway that holds it, and by no other. Two gateways
 * with runtime directories of their own and one data directory both get past
 * the socket's lock, and this one stops the second.
 */
export function takeDataLock(dataDir: string): Lock {
  const runtime = join(dataDir, "runtime");
  mkdirSync(runtime, { recursive: true, mode: 0o700 });
  const words = `Another gateway is using the roster in ${dataDir}. Use that gateway, or stop it before starting another.`;
  return takeLock(join(runtime, "owner.lock"), (cause) => new LockHeldError(words, { cause }));
}
