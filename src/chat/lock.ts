import { join } from "node:path";
import { type Lock, LockHeldError, takeLock } from "../lib/lock/node.ts";
import { runtimeDir } from "../lib/runtime/node.ts";

/** Another chat server is already running with this runtime directory. */
export class ChatRunningError extends LockHeldError {}

/**
 * One chat server per runtime directory, with the lock in a file there. Take
 * it first, before the data directory is touched: a server that is refused has
 * made nothing, servers that start at the same moment cannot both get through,
 * and a killed server leaves nothing to clean up. The store's own lock is the
 * guard for two servers that share a data directory but not a runtime
 * directory, and the gateway takes one chat server.
 */
export function takeChatLock(): Lock {
  const path = join(runtimeDir(), "chat.lock");
  const words = `A chat server is already running here, holding ${path}. Use that one, or stop it before starting another.`;
  return takeLock(path, (cause) => new ChatRunningError(words, { cause }));
}
