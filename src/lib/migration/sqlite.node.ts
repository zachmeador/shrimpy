import type { DatabaseSync } from "node:sqlite";

/** The files SQLite may keep beside the database `file`, which go with it when it is moved. */
export const sqliteBeside = (file: string): string[] => [`${file}-wal`, `${file}-shm`];

/** Copy the database `db` has open to `to`, as one file with nothing beside it. */
export function copySqlite(db: DatabaseSync, to: string): void {
  db.prepare("VACUUM INTO ?").run(to);
}
