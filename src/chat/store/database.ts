import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { newId } from "../../lib/ids/index.ts";
import { isLocked, LockHeldError } from "../../lib/lock/node.ts";
import { beforeOpening, copySqlite, sqliteBeside } from "../../lib/migration/node.ts";
import type { ChatFormat, ChatStep } from "./schema.ts";

/**
 * Open the database as its only user. Exclusive locking mode keeps the file
 * locked for as long as this connection lives, and the kernel drops the lock if
 * the process dies, so there is no heartbeat or stale lock to clean up. A second
 * chat server on the same data directory fails right here instead of writing
 * beside this one. The log is in WAL mode, and FULL syncing means a post that
 * was accepted survives a power cut. A store at an older version of `format` is
 * copied aside and brought up to date in the transaction that opens it.
 */
export function openDatabase(dataDir: string, format: ChatFormat): DatabaseSync {
  const directory = join(dataDir, "state");
  // These are people's conversations: nobody else on the machine needs to see them.
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, "chat.sqlite");
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: true });
  try {
    db.exec("PRAGMA locking_mode = EXCLUSIVE");
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = FULL");
    const found = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    const store = {
      file,
      beside: sqliteBeside(file),
      what: `The chat store in ${dataDir}`,
      program: "the chat server",
      startingOver: "The new store starts with no rooms, threads or messages, and each agent starts over in it by itself.",
      found: found === 0 ? undefined : found,
      format,
    };
    const steps = beforeOpening(store, (to) => copySqlite(db, to));
    db.exec("BEGIN IMMEDIATE");
    upToDate(db, format, store.found, steps);
    db.exec("COMMIT");
  } catch (error) {
    db.close();
    if (!isLocked(error)) throw error;
    throw new LockHeldError(`Another chat server is using the data in ${dataDir}. Talk to that server instead of opening its store.`, { cause: error });
  }
  return db;
}

/** Make the tables of a new store, or run the steps an older one needs. */
function upToDate(db: DatabaseSync, format: ChatFormat, found: number | undefined, steps: readonly ChatStep[]): void {
  if (found === format.current) return;
  if (found === undefined) {
    db.exec(format.schema);
    db.prepare("INSERT INTO store (id) VALUES (?)").run(newId("store"));
  }
  for (const step of steps) for (const statement of step.statements) db.exec(statement);
  db.exec(`PRAGMA user_version = ${format.current}`);
}
