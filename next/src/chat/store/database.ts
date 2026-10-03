import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA, SCHEMA_VERSION } from "./schema.ts";

export class StoreOwnedError extends Error {
  constructor(dataDir: string, options?: ErrorOptions) {
    super(
      `Another chat server is using the data in ${dataDir}. Talk to that server instead of opening its store.`,
      options,
    );
    this.name = "StoreOwnedError";
  }
}

/**
 * Open the database as its only user. Exclusive locking mode keeps the file
 * locked for as long as this connection lives, and the kernel drops the lock if
 * the process dies, so there is no heartbeat or stale lock to clean up. A second
 * chat server on the same data directory fails right here instead of writing
 * beside this one. The log is in WAL mode, and FULL syncing means a post that
 * was accepted survives a power cut.
 */
export function openDatabase(dataDir: string): DatabaseSync {
  const directory = join(dataDir, "state");
  // These are people's conversations: nobody else on the machine needs to see them.
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, "chat.sqlite"), { enableForeignKeyConstraints: true });
  try {
    db.exec("PRAGMA locking_mode = EXCLUSIVE");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = FULL");
    db.exec("BEGIN IMMEDIATE");
    createTables(db, dataDir);
    db.exec("COMMIT");
  } catch (error) {
    db.close();
    throw isLocked(error) ? new StoreOwnedError(dataDir, { cause: error }) : error;
  }
  return db;
}

function createTables(db: DatabaseSync, dataDir: string): void {
  const found = db.prepare("PRAGMA user_version").get() as { user_version: number } | undefined;
  const version = found?.user_version ?? 0;
  if (version === SCHEMA_VERSION) return;
  if (version !== 0) {
    throw new Error(
      `The chat store in ${dataDir} is version ${version}, and this chat server reads version ${SCHEMA_VERSION}.`,
    );
  }
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}

/** SQLITE_BUSY, in any of its extended forms. */
function isLocked(error: unknown): boolean {
  return error instanceof Error && "errcode" in error && Number(error.errcode) % 256 === 5;
}
