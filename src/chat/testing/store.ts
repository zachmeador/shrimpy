import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { openStore, type Store } from "../store/index.ts";

/** Where a test's store and working marks report a watcher that failed: on standard error, as the chat server does. */
export const reportToStderr = (error: Error): void => console.error("[chat]", error);

/** A store in a fresh data directory. It is closed, and the directory removed, when the test ends. */
export function openTestStore(t: TestContext): { store: Store; dataDir: string } {
  const dataDir = tempDir(t, "chat-store");
  const store = openStore(dataDir, { onError: reportToStderr });
  stopAfter(t, () => store.close());
  return { store, dataDir };
}

/**
 * Write into `dataDir` the chat store that the release `release` wrote, from
 * the dump of one beside this file, and answer with the store's file.
 */
export function writeStoreOf(dataDir: string, release: "1.0.0"): string {
  const file = join(dataDir, "state", "chat.sqlite");
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  // A message and the event that posted it name each other, so the rows go in with the checks of what they name off.
  const db = new DatabaseSync(file, { enableForeignKeyConstraints: false });
  db.exec(readFileSync(new URL(`chat-${release}.sql`, import.meta.url), "utf8"));
  db.close();
  return file;
}
