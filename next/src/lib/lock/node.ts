/**
 * An exclusive lock the operating system holds for a process, kept in a SQLite
 * file, so that one process at a time owns something such as a home or a
 * socket. Node only, so this is its only door. It must not know what the lock
 * protects or what a program says when another process holds it.
 */
export { isLocked, type Lock, takeLock } from "./lock.node.ts";
