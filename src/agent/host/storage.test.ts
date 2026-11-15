import assert from "node:assert/strict";
import { readFileSync, renameSync } from "node:fs";
import { test } from "node:test";
import { applySqliteMigrations, SQLITE_MIGRATIONS } from "@earendil-works/pi-durable/storage/sqlite";
import { openNodeSqliteDatabase } from "@earendil-works/pi-durable/storage/sqlite/node";
import { tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { homePaths } from "../home/index.ts";
import { startAgent } from "../index.ts";
import { closeAfter, fauxModels, SCOUT } from "../testing/index.ts";

const timeout = 30_000;

/** Pi's storage as Pi 1.0 left it: at the first version of Pi's schema, which Pi keeps unchanged in its history. */
async function leaveStorageOfPi1(database: string): Promise<void> {
  const db = await openNodeSqliteDatabase(database);
  try {
    await applySqliteMigrations(db, SQLITE_MIGRATIONS.slice(0, 1));
  } finally {
    await db.close();
  }
}

test("Pi storage from before the move to Pi 1.5.2 is refused before anything changes it, in words that name it, and the agent starts fresh once it is moved away", { timeout }, async (t) => {
  useRuntimeDir(t);
  const home = tempDir(t, "home");
  const { database } = homePaths(home);
  await leaveStorageOfPi1(database);
  const before = readFileSync(database);
  const start = () => startAgent({ home, name: SCOUT, ...fauxModels({ home }) });

  // An agent that starts all the same is closed, so that the test fails and doesn't hang.
  await assert.rejects(
    start().then((agent) => agent.close()),
    (error: Error) => error.message.includes(database),
  );

  assert.deepEqual(readFileSync(database), before, "the storage is as it was");
  renameSync(database, `${database}.archived`);
  closeAfter(t, await start());
});
