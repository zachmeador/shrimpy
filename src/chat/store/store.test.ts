import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { Member } from "../../contracts/chat/index.ts";
import { migrationCopy } from "../../lib/migration/node.ts";
import { tempDir } from "../../lib/testing/index.ts";
import { agent, openTestStore, person, reportToStderr } from "../testing/index.ts";
import { type ChannelRecord, type Change, CHAT_FORMAT, type ChatFormat, openStore, type Store, type Transaction } from "./index.ts";

function openDm(tx: Transaction, first: Member, second: Member, now = 1000): ChannelRecord {
  tx.saveMember(first);
  tx.saveMember(second);
  return tx.createDirectChannel(first, second, now);
}

function mainThread(tx: Transaction, channelId: string): string {
  const main = tx.threadsIn(channelId).find((thread) => thread.main);
  if (main === undefined) throw new Error("no main thread");
  return main.id;
}

function post(tx: Transaction, threadId: string, author: Member, text: string, sentAt = 2000) {
  return tx.appendMessage({
    threadId,
    authorId: author.id,
    text,
    sentAt,
    mentions: [],
    preview: text,
  });
}

test("threads updated in the same millisecond are listed in the order of their messages", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  store.transaction((tx) => {
    const channel = openDm(tx, zach, agent("Shrimpy"), 1000);
    const main = mainThread(tx, channel.id);
    const side = tx.addThread(channel.id, "side", 1000).id;

    post(tx, side, zach, "first", 5000);
    post(tx, main, zach, "second", 5000);
    assert.deepEqual(
      tx.threadsIn(channel.id).map((thread) => thread.id),
      [main, side],
    );

    post(tx, side, zach, "third", 5000);
    assert.deepEqual(
      tx.threadsIn(channel.id).map((thread) => thread.id),
      [side, main],
    );
  });
});

test("an older clock reading does not make a thread look older", (t) => {
  const { store } = openTestStore(t);
  store.transaction((tx) => {
    const channel = openDm(tx, person("Zach"), agent("Shrimpy"), 1000);
    const threadId = mainThread(tx, channel.id);
    post(tx, threadId, person("Zach"), "later", 5000);
    post(tx, threadId, person("Zach"), "earlier", 4000);

    assert.equal(tx.thread(threadId)?.updatedAt, 5000);
  });
});

test("a transaction that fails leaves nothing behind and tells nobody", (t) => {
  const { store } = openTestStore(t);
  const heard: Change[] = [];
  store.subscribe((change) => heard.push(change));
  const zach = person("Zach");

  assert.throws(
    () =>
      store.transaction((tx) => {
        const channel = openDm(tx, zach, agent("Shrimpy"));
        post(tx, mainThread(tx, channel.id), zach, "never kept");
        throw new Error("changed my mind");
      }),
    /changed my mind/,
  );

  store.transaction((tx) => {
    assert.equal(tx.head(), 0);
    assert.deepEqual(tx.channelsOf(zach.id), []);
    assert.equal(tx.member(zach.id), undefined);
  });
  assert.deepEqual(heard, []);
});

test("the store's directory is private to its owner", (t) => {
  const { dataDir } = openTestStore(t);

  assert.equal(statSync(join(dataDir, "state")).mode & 0o777, 0o700);
});

test("a store from before the move to Pi 1.5.2 is refused, in words that name its folder, and left as it is", (t) => {
  const dataDir = tempDir(t, "chat-old");
  mkdirSync(join(dataDir, "state"));
  const file = join(dataDir, "state", "chat.sqlite");
  const old = new DatabaseSync(file);
  // The version the chat server wrote until the move.
  old.exec("CREATE TABLE skips (message_seq INTEGER, member_id TEXT); PRAGMA user_version = 7");
  old.close();

  assert.throws(
    () => openStore(dataDir, { onError: reportToStderr }),
    (error: Error) => error.message.includes(dataDir),
  );

  const after = new DatabaseSync(file);
  const tables = after.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  after.close();
  assert.deepEqual(
    tables.map((table) => table.name),
    ["skips"],
  );
});

test("the next release copies a store aside and migrates it, and this one then refuses it, naming the copy, until the copy is put back", (t) => {
  const dataDir = tempDir(t, "chat-update");
  const file = join(dataDir, "state", "chat.sqlite");
  const onError = reportToStderr;
  const zach = person("Zach");
  const texts = (store: Store, threadId: string): string[] =>
    store.transaction((tx) => tx.messagesIn(threadId, null, 10).map((message) => message.text));
  // The next release adds a column to the threads.
  const next: ChatFormat = {
    ...CHAT_FORMAT,
    current: CHAT_FORMAT.current + 1,
    steps: [...CHAT_FORMAT.steps, { version: CHAT_FORMAT.current + 1, statements: ["ALTER TABLE threads ADD COLUMN colour TEXT"] }],
  };
  const today = openStore(dataDir, { onError });
  const threadId = today.transaction((tx) => {
    const main = mainThread(tx, openDm(tx, zach, agent("Shrimpy")).id);
    post(tx, main, zach, "said before the update");
    return main;
  });
  today.close();

  const updated = openStore(dataDir, { onError, format: next });
  assert.deepEqual(texts(updated, threadId), ["said before the update"]);
  updated.close();
  const raw = new DatabaseSync(file, { readOnly: true });
  const columns = raw.prepare("SELECT name FROM pragma_table_info('threads')").all().map((column) => column.name);
  raw.close();
  assert.ok(columns.includes("colour"), "the next release's step ran");
  const copy = migrationCopy(file);
  assert.ok(existsSync(copy));

  assert.throws(
    () => openStore(dataDir, { onError }),
    (error: Error) => error.message.includes(copy),
  );

  renameSync(copy, file);
  const back = openStore(dataDir, { onError });
  assert.deepEqual(texts(back, threadId), ["said before the update"]);
  back.close();
});
