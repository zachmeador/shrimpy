import { existsSync } from "node:fs";
import { basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

/**
 * The version of Pi's storage since Shrimpy moved to Pi 1.5.2. Pi 1.0 kept its
 * storage at version 1, and Pi 1.5 takes storage to version 2 when it opens it,
 * after which it would read Shrimpy's records and tasks from before the move as
 * if they were current.
 */
const SINCE_THE_MOVE = 2;

/**
 * Refuse the home's Pi storage at `database` if it was written before the move,
 * before Pi opens it and changes it. Storage that isn't there yet is new. The
 * file is only read, by the version Pi keeps in it.
 */
export function refuseOlderStorage(database: string): void {
  if (!existsSync(database)) return;
  const name = pathToFileURL(database);
  // With no log beside it, everything is in the file, which is read as it is, so SQLite makes no files beside it.
  if (!existsSync(`${database}-wal`)) name.searchParams.set("immutable", "1");
  const db = new DatabaseSync(name, { readOnly: true });
  let version: number | undefined;
  try {
    const kept = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'durable_schema'").get();
    const row = kept === undefined ? undefined : db.prepare("SELECT version FROM durable_schema WHERE singleton = 1").get();
    version = (row as { version: number } | undefined)?.version;
  } finally {
    db.close();
  }
  if (version !== undefined && version < SINCE_THE_MOVE) {
    const file = basename(database);
    throw new Error(
      `The agent's Pi storage in ${database} was written by another version of Shrimpy, and nothing converts it. ` +
        `Move ${database} into an archive folder, with ${file}-wal and ${file}-shm if they are beside it, and start the agent again. ` +
        "Its sessions go with it, and the rest of the home stays.",
    );
  }
}
