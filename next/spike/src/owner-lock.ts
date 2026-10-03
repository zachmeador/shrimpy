import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * One owner per home, held by the OS: an exclusive lock on a SQLite file (fcntl, taken by SQLite itself).
 * It needs no native module, no heartbeat and no pid file, and the kernel drops it when the process dies, SIGKILL included.
 * Take it before opening the Harness: a second Harness on the same storage rewrites the owner's task rows.
 */
export function takeOwnerLock(home: string): { release(): void } {
	mkdirSync(join(home, "runtime"), { recursive: true });
	const db = new DatabaseSync(join(home, "runtime", "owner.lock"));
	try {
		db.exec("PRAGMA locking_mode = EXCLUSIVE");
		db.exec("BEGIN EXCLUSIVE");
	} catch (error) {
		db.close();
		throw new Error(`Another process owns this home (${join(home, "runtime", "owner.lock")} is locked). Talk to that process instead of opening its storage.`, { cause: error });
	}
	return { release: () => db.close() };
}
