import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface OwnerLock {
  release(): void;
}

/**
 * One owner per home, held by the OS: an exclusive lock on a SQLite file. The
 * kernel drops it when the process dies, so there is no heartbeat, pid file or
 * stale-lock takeover. Take it before opening storage: opening a home's
 * storage rewrites unfinished work, so a second opener corrupts the owner.
 */
export function takeOwnerLock(home: string): OwnerLock {
  const file = join(home, "runtime", "owner.lock");
  mkdirSync(join(home, "runtime"), { recursive: true });
  const db = new DatabaseSync(file);
  try {
    db.exec("PRAGMA locking_mode = EXCLUSIVE");
    db.exec("BEGIN EXCLUSIVE");
  } catch (error) {
    db.close();
    throw new HomeOwnedError(home, { cause: error });
  }
  return { release: () => db.close() };
}

export class HomeOwnedError extends Error {
  constructor(home: string, options?: ErrorOptions) {
    super(
      `Another process owns the agent home at ${home}. Talk to that agent instead of opening its storage.`,
      options,
    );
    this.name = "HomeOwnedError";
  }
}
