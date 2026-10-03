import { DatabaseSync } from "node:sqlite";

export interface Lock {
  /** Free the lock. Releasing again does nothing. */
  release(): void;
}

/**
 * Take an exclusive lock on the SQLite file at `path`, which is made if it
 * does not exist. The operating system holds it for the process and drops it
 * when the process dies, so there is no heartbeat, pid file or stale lock to
 * clean up, and two callers that start at the same moment cannot both get it.
 *
 * When someone else holds the lock, this throws what `heldElsewhere` returns
 * for the underlying error. Any other failure, such as a file that cannot be
 * opened, keeps its own message: it says nothing about another holder.
 */
export function takeLock(path: string, heldElsewhere: (cause: Error) => Error): Lock {
  const db = new DatabaseSync(path);
  try {
    db.exec("PRAGMA locking_mode = EXCLUSIVE");
    db.exec("BEGIN EXCLUSIVE");
  } catch (error) {
    db.close();
    throw isLocked(error) ? heldElsewhere(error) : error;
  }
  let held = true;
  return {
    release() {
      if (!held) return;
      held = false;
      db.close();
    },
  };
}

/** Whether SQLite refused because another connection holds the database: SQLITE_BUSY, in any of its extended forms. */
export function isLocked(error: unknown): error is Error {
  return error instanceof Error && "errcode" in error && Number(error.errcode) % 256 === 5;
}
