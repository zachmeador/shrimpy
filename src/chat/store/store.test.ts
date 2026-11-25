import assert from "node:assert/strict";
import { existsSync, mkdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import type { Member } from "../../contracts/chat/index.ts";
import { migrationCopy } from "../../lib/migration/node.ts";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { agent, openTestStore, person, reportToStderr, writeStoreOf } from "../testing/index.ts";
import { type ChannelRecord, type Change, CHAT_FORMAT, type ChatFormat, openStore, type Store, type Transaction } from "./index.ts";

function openDm(tx: Transaction, first: Member, second: Member): ChannelRecord {
  tx.saveMember(first);
  tx.saveMember(second);
  return tx.createDirectChannel(first, second);
}

/** A thread of a new DM between `first` and `second`, made at `now`. */
function threadOfDm(tx: Transaction, first: Member, second: Member, now = 1000): string {
  return tx.addThread(openDm(tx, first, second).id, null, now).id;
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
    const channel = openDm(tx, zach, agent("Shrimpy"));
    const main = tx.addThread(channel.id, null, 1000).id;
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
    const threadId = threadOfDm(tx, person("Zach"), agent("Shrimpy"));
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
        post(tx, threadOfDm(tx, zach, agent("Shrimpy")), zach, "never kept");
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
    const thread = threadOfDm(tx, zach, agent("Shrimpy"));
    post(tx, thread, zach, "said before the update");
    return thread;
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

test("a store as 1.0.0 wrote it is copied aside and migrated: each room's main thread is its first pin, and a DM's empty main thread goes", (t) => {
  const dataDir = tempDir(t, "chat-1.0.0");
  const file = writeStoreOf(dataDir, "1.0.0");
  const store = openStore(dataDir, { onError: reportToStderr });
  stopAfter(t, () => store.close());

  // The copy is the store as 1.0.0 left it, and says which threads were main.
  const copy = new DatabaseSync(migrationCopy(file), { readOnly: true });
  const before = copy.prepare("SELECT id, channel_id, main FROM threads").all() as { id: string; channel_id: string; main: number }[];
  assert.equal((copy.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 10);
  copy.close();
  const mainOf = (channelId: string): string | undefined => before.find((thread) => thread.channel_id === channelId && thread.main === 1)?.id;

  store.transaction((tx) => {
    const room = (name: string): ChannelRecord => tx.roomNamed(name) ?? assert.fail(`no room ${name}`);
    const dm = (first: string, second: string): ChannelRecord => tx.directChannel(first, second) ?? assert.fail(`no DM of ${first} and ${second}`);
    const shape = (channel: ChannelRecord): [string, boolean][] => tx.threadsIn(channel.id).map((thread) => [thread.id, thread.pinned !== null]);
    const others = (channel: ChannelRecord): string[] => before.filter((thread) => thread.channel_id === channel.id && thread.main === 0).map((thread) => thread.id);

    const ops = room("ops");
    const [incidents] = others(ops);
    assert.deepEqual(shape(ops), [[mainOf(ops.id), true], [incidents, false]], "pinned first, though the other thread is newer");
    const quiet = room("quiet");
    assert.deepEqual(shape(quiet), [[mainOf(quiet.id), true]], "a room's main thread is pinned though it holds nothing");

    const withScout = dm("mem_zach", "mem_scout");
    const talk = mainOf(withScout.id) ?? "";
    assert.deepEqual(shape(withScout).toSorted(), [[talk, false], ...others(withScout).map((id): [string, boolean] => [id, false])].toSorted());
    const [asked, answer] = tx.messagesIn(talk, null, 10);
    assert.deepEqual([asked?.text, answer?.text], ["How full is the disk?", "91%, mostly old logs."]);
    assert.deepEqual([asked?.receipts.length, answer?.reactions.length, tx.unreadIn("mem_zach", talk)], [1, 1, 0], "with its receipt, reaction and read mark");

    const withCrab = dm("mem_zach", "mem_crab");
    assert.deepEqual(shape(withCrab), others(withCrab).map((id) => [id, false]), "the DM's empty main thread is gone");
    const between = dm("mem_scout", "mem_crab");
    assert.deepEqual(tx.threadsIn(between.id).map((thread) => thread.name), ["plans"], "and one with a name stays");
  });
  assert.equal(
    store.transaction((tx) => tx.addThread(tx.roomNamed("quiet")?.id ?? "", "plans", 3000).pinned),
    null,
    "and the store takes new threads",
  );
});
