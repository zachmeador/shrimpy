import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test, type TestContext } from "node:test";
import { startChild, stopAfter, tempDir } from "../../lib/testing/index.ts";
import { openTestStore } from "../testing/index.ts";
import { openStore, StoreOwnedError } from "./index.ts";

const storeModule = new URL("./index.ts", import.meta.url).href;

function holdStoreInChild(t: TestContext, dataDir: string) {
  const source = `
    import { openStore } from ${JSON.stringify(storeModule)};
    // Held in a global: a store nothing refers to is closed when it is collected.
    globalThis.store = openStore(${JSON.stringify(dataDir)});
    console.log(JSON.stringify({ event: "opened" }));
    setInterval(() => {}, 1000);
  `;
  return startChild(t, { source });
}

test("a second store on the same data directory is refused, and the first keeps working", (t) => {
  const { store, dataDir } = openTestStore(t);

  assert.throws(
    () => openStore(dataDir),
    (error) =>
      error instanceof StoreOwnedError &&
      error.message.includes(dataDir) &&
      /Another chat server/.test(error.message),
  );

  store.transaction((tx) => assert.equal(tx.head(), 0));
});

test("a store can be opened again once its owner has closed it", (t) => {
  const { store, dataDir } = openTestStore(t);
  store.close();

  const again = openStore(dataDir);
  stopAfter(t, () => again.close());
  again.transaction((tx) => assert.equal(tx.head(), 0));
});

test("a process that owns the store keeps others out, and a killed owner frees it", async (t) => {
  const dataDir = tempDir(t, "chat-owner");
  const holder = await holdStoreInChild(t, dataDir);

  assert.throws(() => openStore(dataDir), StoreOwnedError);

  await holder.kill("SIGKILL");
  const freed = openStore(dataDir);
  stopAfter(t, () => freed.close());
  freed.transaction((tx) => assert.equal(tx.head(), 0));
});

test("a store written by another version is refused, not changed", (t) => {
  const dataDir = tempDir(t, "chat-version");
  mkdirSync(join(dataDir, "state"));
  const db = new DatabaseSync(join(dataDir, "state", "chat.sqlite"));
  db.exec("PRAGMA user_version = 99");
  db.close();

  assert.throws(() => openStore(dataDir), /is version 99/);
  assert.throws(() => openStore(dataDir), /is version 99/);
});
