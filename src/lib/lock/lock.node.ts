import { DatabaseSync } from "node:sqlite";

export interface Lock {
  /** Free the lock. Releasing again does nothing. */
  release(): void;
}

/**
 * Another process holds a lock this one asked for. Its message is the words of
 * whoever asked, for a person, saying whose the lock is and what to do. A
 * program names a class of its own after this one where a caller tells that
 * program's lock apart.
 */
export class LockHeldError extends Error {
  constructor(words: string, options?: ErrorOptions) {
    super(words, options);
    this.name = new.target.name;
  }
}

/**
 * Take an exclusive lock on the SQLite file at `path`, which is made if it
 * does not exist. The operating system holds it for the process and drops it
 * when the process dies, so there is no heartbeat, pid file or stale lock to
 * clean up, and two callers that start at the same moment cannot both get it.
 * It is held for as long as the caller holds what this returns: a lock that
 * nothing holds any more is let go of when Node collects it.
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

/**
 * Whether SQLite refused because another connection holds the database:
 * SQLITE_BUSY, in any of its extended forms. An error that carries no code is
 * judged by its message, which is all it has.
 */
export function isLocked(error: unknown): error is Error {
  if (!(error instanceof Error)) return false;
  return "errcode" in error ? Number(error.errcode) % 256 === 5 : error.message.includes("locked");
}
