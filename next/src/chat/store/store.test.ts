import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { Member } from "../../contracts/chat/index.ts";
import { agent, openTestStore, person, stopAfter } from "../testing/index.ts";
import {
  type ChannelRecord,
  type Change,
  openStore,
  type Transaction,
} from "./index.ts";

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
    addressed: [],
    requestId: `request-${text}`,
    preview: text,
  });
}

test("saving a member renames one on record, and adding leaves one on record alone", (t) => {
  const { store } = openTestStore(t);
  store.transaction((tx) => {
    tx.saveMember({ id: "person:zach", kind: "person", name: "Zach" });
    tx.saveMember({ id: "person:zach", kind: "person", name: "Zachariah" });
    tx.addMember({ id: "person:zach", kind: "person", name: "Somebody else" });
    tx.addMember(agent("Shrimpy"));
  });

  store.transaction((tx) => {
    assert.deepEqual(tx.member("person:zach"), { id: "person:zach", kind: "person", name: "Zachariah" });
    assert.deepEqual(tx.member("agent:shrimpy"), agent("Shrimpy"));
    assert.equal(tx.member("person:nobody"), undefined);
  });
});

test("a DM holds its two members and a main thread, and is found from either side", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const shrimpy = agent("Shrimpy");

  const channel = store.transaction((tx) => openDm(tx, zach, shrimpy, 1000));

  assert.equal(channel.kind, "dm");
  assert.equal(channel.name, null);
  assert.deepEqual(channel.members, [shrimpy, zach]);
  store.transaction((tx) => {
    assert.deepEqual(tx.directChannel(zach.id, shrimpy.id), channel);
    assert.deepEqual(tx.directChannel(shrimpy.id, zach.id), channel);
    assert.deepEqual(tx.channel(channel.id), channel);
    assert.deepEqual(tx.channelsOf(zach.id), [channel]);
    assert.deepEqual(tx.channelsOf(shrimpy.id), [channel]);
    assert.deepEqual(tx.channelsOf("person:stranger"), []);
    assert.equal(tx.directChannel(zach.id, "agent:other"), undefined);
    assert.equal(tx.channel("ch_missing"), undefined);

    const [main, ...others] = tx.threadsIn(channel.id);
    assert.deepEqual(others, []);
    assert.deepEqual(main, {
      id: main?.id,
      channelId: channel.id,
      main: true,
      name: null,
      preview: null,
      archived: false,
      updatedAt: 1000,
    });
  });
});

test("a channel list keeps channels in the order they were made", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const [first, second] = store.transaction((tx) => [
    openDm(tx, zach, agent("A")),
    openDm(tx, zach, agent("B")),
  ]);

  store.transaction((tx) => {
    assert.deepEqual(
      tx.channelsOf(zach.id).map((channel) => channel.id),
      [first.id, second.id],
    );
  });
});

test("a channel has one main thread, and side threads are listed by recent use", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const shrimpy = agent("Shrimpy");

  store.transaction((tx) => {
    const channel = openDm(tx, zach, shrimpy, 1000);
    const older = tx.addThread(channel.id, "older", 2000);
    const newer = tx.addThread(channel.id, null, 3000);
    post(tx, older.id, zach, "bumps the older thread", 4000);

    assert.equal(older.main, false);
    assert.equal(newer.name, null);
    assert.deepEqual(
      tx.threadsIn(channel.id).map((thread) => thread.id),
      [older.id, newer.id, mainThread(tx, channel.id)],
    );
  });
});

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

test("two members have one DM between them", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const shrimpy = agent("Shrimpy");
  store.transaction((tx) => openDm(tx, zach, shrimpy));

  assert.throws(() => store.transaction((tx) => tx.createDirectChannel(shrimpy, zach, 2000)));
});

test("posting gives increasing positions, and the thread keeps its preview, count and time", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const shrimpy = agent("Shrimpy");

  const { first, second, threadId } = store.transaction((tx) => {
    const channel = openDm(tx, zach, shrimpy, 1000);
    const threadId = mainThread(tx, channel.id);
    const first = tx.appendMessage({
      threadId,
      authorId: zach.id,
      text: "Hello there",
      sentAt: 2000,
      addressed: [shrimpy.id],
      requestId: "r1",
      preview: "Hello there",
    });
    const second = tx.appendMessage({
      threadId,
      authorId: shrimpy.id,
      text: "Hi!",
      sentAt: 3000,
      addressed: [zach.id],
      requestId: "r1",
      preview: "Hi!",
    });
    return { first, second, threadId };
  });

  assert.equal(second.seq, first.seq + 1);
  assert.deepEqual(first, {
    id: first.id,
    seq: first.seq,
    channelId: first.channelId,
    threadId,
    author: zach,
    text: "Hello there",
    sentAt: 2000,
    addressed: [shrimpy.id],
    skippedBy: [],
  });
  store.transaction((tx) => {
    assert.equal(tx.messageCount(threadId), 2);
    assert.deepEqual(tx.thread(threadId), {
      id: threadId,
      channelId: first.channelId,
      main: true,
      name: null,
      preview: "Hello there",
      archived: false,
      updatedAt: 3000,
    });
    assert.deepEqual(tx.message(second.id), second);
    assert.equal(tx.head(), second.seq);
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

test("a retry is found by its author and request, and a request belongs to one author", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const shrimpy = agent("Shrimpy");

  const posted = store.transaction((tx) => {
    const channel = openDm(tx, zach, shrimpy);
    return post(tx, mainThread(tx, channel.id), zach, "once");
  });

  store.transaction((tx) => {
    assert.deepEqual(tx.postedBy(zach.id, "request-once"), posted);
    assert.equal(tx.postedBy(shrimpy.id, "request-once"), undefined);
    assert.equal(tx.postedBy(zach.id, "another-request"), undefined);
  });
});

test("a request cannot be used for two posts by the same author", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");

  assert.throws(() =>
    store.transaction((tx) => {
      const channel = openDm(tx, zach, agent("Shrimpy"));
      const threadId = mainThread(tx, channel.id);
      post(tx, threadId, zach, "same");
      post(tx, threadId, zach, "same");
    }),
  );
  store.transaction((tx) => assert.equal(tx.head(), 0));
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

test("watchers hear of a commit after it, and one that fails does not stop the others", (t) => {
  const reported: string[] = [];
  const { store } = openTestStore(t, { onError: (error) => reported.push(error.message) });
  const zach = person("Zach");
  const seen: { change: Change; head: number }[] = [];
  store.subscribe(() => {
    throw new Error("a broken watcher");
  });
  const stop = store.subscribe((change) => {
    seen.push({ change, head: store.transaction((tx) => tx.head()) });
  });

  const threadId = store.transaction((tx) => {
    const channel = openDm(tx, zach, agent("Shrimpy"));
    const threadId = mainThread(tx, channel.id);
    post(tx, threadId, zach, "hello");
    tx.renameThread(threadId, "Main");
    return threadId;
  });

  assert.deepEqual(seen, [
    { change: { kind: "message", threadId }, head: 1 },
    { change: { kind: "thread", threadId }, head: 1 },
  ]);
  assert.deepEqual(reported, ["a broken watcher", "a broken watcher"]);

  stop();
  store.transaction((tx) => post(tx, threadId, zach, "unheard"));
  assert.equal(seen.length, 2);
});

test("a member's new name is reported for the threads it is in, and only then", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const shrimpy = agent("Shrimpy");
  const { mine, side, elsewhere } = store.transaction((tx) => {
    const channel = openDm(tx, zach, shrimpy);
    const other = openDm(tx, shrimpy, agent("Other"));
    return {
      mine: mainThread(tx, channel.id),
      side: tx.addThread(channel.id, "side", 2000).id,
      elsewhere: mainThread(tx, other.id),
    };
  });
  const heard: Change[] = [];
  store.subscribe((change) => heard.push(change));

  store.transaction((tx) => {
    tx.saveMember(zach);
    tx.addMember({ ...zach, name: "Ignored" });
    tx.saveMember(person("Newcomer"));
  });
  assert.equal(heard.length, 0);

  store.transaction((tx) => tx.saveMember({ ...zach, name: "Zachariah" }));
  assert.deepEqual(
    heard.map((change) => [change.kind, change.threadId]).sort(),
    [
      ["thread", mine],
      ["thread", side],
    ].sort(),
  );
  assert.ok(!heard.some((change) => change.threadId === elsewhere));
});

test("the store's directory is private to its owner", (t) => {
  const { dataDir } = openTestStore(t);

  assert.equal(statSync(join(dataDir, "state")).mode & 0o777, 0o700);
});

test("renaming and archiving return the thread as it now is", (t) => {
  const { store } = openTestStore(t);
  store.transaction((tx) => {
    const channel = openDm(tx, person("Zach"), agent("Shrimpy"));
    const threadId = mainThread(tx, channel.id);

    assert.equal(tx.renameThread(threadId, "Plans").name, "Plans");
    assert.equal(tx.archiveThread(threadId, true).archived, true);
    assert.deepEqual(
      [tx.thread(threadId)?.name, tx.thread(threadId)?.archived],
      ["Plans", true],
    );
    assert.equal(tx.archiveThread(threadId, false).archived, false);
  });
});

test("a thread is read a page at a time, oldest first", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const texts = Array.from({ length: 7 }, (_, index) => `message ${index + 1}`);
  const { threadId, posted } = store.transaction((tx) => {
    const channel = openDm(tx, zach, agent("Shrimpy"));
    const threadId = mainThread(tx, channel.id);
    const other = tx.addThread(channel.id, "other", 1500);
    post(tx, other.id, zach, "in another thread");
    return { threadId, posted: texts.map((text) => post(tx, threadId, zach, text)) };
  });

  store.transaction((tx) => {
    const newest = tx.messagesIn(threadId, null, 3);
    assert.deepEqual(
      newest.map((message) => message.text),
      ["message 5", "message 6", "message 7"],
    );
    const before = newest[0]?.seq ?? 0;
    assert.deepEqual(
      tx.messagesIn(threadId, before, 3).map((message) => message.text),
      ["message 2", "message 3", "message 4"],
    );
    assert.deepEqual(
      tx.messagesIn(threadId, posted[1]?.seq ?? 0, 10).map((message) => message.text),
      ["message 1"],
    );
    assert.deepEqual(tx.messagesIn(threadId, posted[0]?.seq ?? 0, 10), []);
    assert.equal(tx.messageCount(threadId), 7);
  });
});

test("a member is offered messages after a cursor, in its own channels only", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const shrimpy = agent("Shrimpy");
  const other = agent("Other");
  const { ours, theirs } = store.transaction((tx) => {
    const ours = openDm(tx, zach, shrimpy);
    const theirs = openDm(tx, zach, other);
    return { ours, theirs };
  });

  const texts = store.transaction((tx) => {
    post(tx, mainThread(tx, ours.id), zach, "one");
    post(tx, mainThread(tx, theirs.id), zach, "private to the other agent");
    post(tx, mainThread(tx, ours.id), shrimpy, "two");
    post(tx, mainThread(tx, ours.id), zach, "three");
    return {
      all: tx.messagesAfter(shrimpy.id, 0, 10).map((message) => message.text),
      afterOne: tx.messagesAfter(shrimpy.id, 1, 10).map((message) => message.text),
      limited: tx.messagesAfter(shrimpy.id, 0, 2).map((message) => message.text),
      other: tx.messagesAfter(other.id, 0, 10).map((message) => message.text),
      stranger: tx.messagesAfter("person:stranger", 0, 10),
    };
  });

  assert.deepEqual(texts.all, ["one", "two", "three"]);
  assert.deepEqual(texts.afterOne, ["two", "three"]);
  assert.deepEqual(texts.limited, ["one", "two"]);
  assert.deepEqual(texts.other, ["private to the other agent"]);
  assert.deepEqual(texts.stranger, []);
});

test("skips are recorded once per agent and show on the message", (t) => {
  const { store } = openTestStore(t);
  const zach = person("Zach");
  const shrimpy = agent("Shrimpy");
  const heard: Change[] = [];
  store.subscribe((change) => heard.push(change));

  const message = store.transaction((tx) => {
    const channel = openDm(tx, zach, shrimpy);
    return post(tx, mainThread(tx, channel.id), zach, "are you there");
  });
  heard.length = 0;

  store.transaction((tx) => {
    tx.markSkipped(message, shrimpy.id);
    tx.markSkipped(message, shrimpy.id);
    tx.markSkipped(message, zach.id);
  });

  store.transaction((tx) => {
    assert.deepEqual(tx.message(message.id)?.skippedBy, [shrimpy.id, zach.id]);
  });
  assert.deepEqual(heard, [
    { kind: "thread", threadId: message.threadId },
    { kind: "thread", threadId: message.threadId },
  ]);
});

test("everything survives closing and reopening, and positions carry on", (t) => {
  const { store, dataDir } = openTestStore(t);
  const zach = person("Zach");
  const { channel, last } = store.transaction((tx) => {
    const channel = openDm(tx, zach, agent("Shrimpy"));
    const threadId = mainThread(tx, channel.id);
    post(tx, threadId, zach, "one");
    return { channel, last: post(tx, threadId, zach, "two") };
  });
  store.close();

  const again = openStore(dataDir);
  stopAfter(t, () => again.close());
  again.transaction((tx) => {
    assert.deepEqual(tx.channelsOf(zach.id), [channel]);
    assert.deepEqual(tx.message(last.id), last);
    assert.equal(tx.head(), last.seq);
    const next = post(tx, last.threadId, zach, "three");
    assert.equal(next.seq, last.seq + 1);
  });
});

test("a transaction cannot be used after it ends, or started inside another", (t) => {
  const { store } = openTestStore(t);
  const leaked = store.transaction((tx) => tx);

  assert.throws(() => leaked.head(), /after it ended/);
  assert.throws(
    () => store.transaction(() => store.transaction((tx) => tx.head())),
    /already open/,
  );
  store.close();
  assert.throws(() => store.transaction((tx) => tx.head()), /closed/);
});
