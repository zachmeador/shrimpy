import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { openTestStore, stopAfter, tempDir } from "../testing/index.ts";
import { openStore, StoreOwnedError } from "./index.ts";

const storeModule = new URL("./index.ts", import.meta.url).href;

function holdStoreInChild(dataDir: string) {
  const script = `
    import { openStore } from ${JSON.stringify(storeModule)};
    // Held in a global: a store nothing refers to is closed when it is collected.
    globalThis.store = openStore(${JSON.stringify(dataDir)});
    console.log("opened");
    setInterval(() => {}, 1000);
  `;
  return spawn(process.execPath, ["--input-type=module", "-e", script], {
    stdio: ["ignore", "pipe", "inherit"],
  });
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
  const child = holdStoreInChild(dataDir);
  stopAfter(t, async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill("SIGKILL");
    await once(child, "exit");
  });
  await once(child.stdout, "data");

  assert.throws(() => openStore(dataDir), StoreOwnedError);

  child.kill("SIGKILL");
  await once(child, "exit");
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
