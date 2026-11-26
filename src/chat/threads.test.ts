import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Channel, Chat, Thread } from "../contracts/chat/index.ts";
import { until } from "../lib/testing/index.ts";
import { refusalOf, startChatInProcess, valueOf } from "./testing/index.ts";

const timeout = 30_000;
const context = BACKGROUND_CONTEXT;

test("a client holding a Thread sees a post arrive, and a request ID's first use wins", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const yourChat = await you.host.get(Chat, {}, context);
  const talking = await scout.host.get(Chat, {}, context);
  const dm = valueOf(await yourChat.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await yourChat.createThread({ channel: dm.id, name: null }, context));
  const watching = await you.host.get(Thread, { thread: thread.id }, context);
  assert.deepEqual(watching.messages.value, []);

  const first = valueOf(await talking.post({ thread: thread.id, text: "The disk is nearly full.", request: "scout-1" }, context));

  await until(() => watching.messages.value.length === 1, "the post to arrive");
  assert.deepEqual(watching.messages.value, [first]);
  assert.equal(first.author.name, "scout");

  // A retry answers with the first message as it stands, and posts nothing.
  valueOf(await talking.edit({ message: first.id, text: "The disk is at 91%.", request: "scout-2" }, context));
  const retried = valueOf(await talking.post({ thread: thread.id, text: "The disk is nearly full.", request: "scout-1" }, context));
  assert.equal(retried.id, first.id);
  assert.equal(retried.text, "The disk is at 91%.");
  // The same ID for something else is refused, and posts nothing either.
  refusalOf(await talking.post({ thread: thread.id, text: "Something else.", request: "scout-1" }, context));
  const read = valueOf(await yourChat.read({ thread: thread.id, before: null, limit: 10 }, context));
  assert.deepEqual(
    read.map((message) => message.text),
    ["The disk is at 91%."],
  );
  await until(() => watching.messages.value[0]?.text === "The disk is at 91%.", "the edit to arrive");
  assert.equal(watching.messages.value.length, 1);
});

test("a rename or an archive names the revision it was decided on, so a stale retry can't undo a later one", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const yourChat = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  const dm = valueOf(await yourChat.openDm({ member: scout.you.id }, context));
  const side = valueOf(await yourChat.createThread({ channel: dm.id, name: null }, context));
  const thread = side.id;
  const watching = await you.host.get(Thread, { thread }, context);

  const named = valueOf(await yourChat.rename({ thread, name: "Disk", revision: side.revision }, context));
  const renamed = valueOf(await scouts.rename({ thread, name: "Logs", revision: named.revision }, context));
  // Scout's rename again, as a retry after its answer was lost would send it: the thread already says it.
  assert.equal(valueOf(await scouts.rename({ thread, name: "Logs", revision: named.revision }, context)).revision, renamed.revision);
  // Your first rename again, as a retry after its answer was lost would send it.
  refusalOf(await yourChat.rename({ thread, name: "Disk", revision: side.revision }, context));
  refusalOf(await yourChat.archive({ thread, archived: true, revision: named.revision }, context));
  const archived = valueOf(await yourChat.archive({ thread, archived: true, revision: renamed.revision }, context));

  await until(() => watching.thread.value?.revision === archived.revision, "the thread to show the archive");
  assert.deepEqual([watching.thread.value?.name, watching.thread.value?.archived], ["Logs", true]);

  // A new message brings it back, which a stale archive can't undo either.
  valueOf(await scouts.post({ thread, text: "The disk is full again.", request: "scout-1" }, context));
  await until(() => watching.thread.value?.archived === false, "the message to bring the thread back");
  refusalOf(await yourChat.archive({ thread, archived: true, revision: archived.revision }, context));
});

test("a replayed edit or reaction answers with the message as it stands, and undoes nothing newer", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const yours = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  const dm = valueOf(await yours.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await yours.createThread({ channel: dm.id, name: null }, context));
  const said = valueOf(await scouts.post({ thread: thread.id, text: "The disk is nearly full.", request: "scout-1" }, context));

  valueOf(await scouts.edit({ message: said.id, text: "The disk is at 91%.", request: "scout-2" }, context));
  valueOf(await scouts.edit({ message: said.id, text: "The disk is at 95%.", request: "scout-3" }, context));
  valueOf(await yours.react({ message: said.id, emoji: "👀", request: "you-1" }, context));
  valueOf(await yours.unreact({ message: said.id, emoji: "👀", request: "you-2" }, context));

  const replayed = valueOf(await scouts.edit({ message: said.id, text: "The disk is at 91%.", request: "scout-2" }, context));
  const reacted = valueOf(await yours.react({ message: said.id, emoji: "👀", request: "you-1" }, context));
  assert.deepEqual([replayed.text, reacted.text, reacted.reactions], ["The disk is at 95%.", "The disk is at 95%.", []]);
  refusalOf(await scouts.edit({ message: said.id, text: "Something else.", request: "scout-2" }, context));
  refusalOf(await yours.unreact({ message: said.id, emoji: "👀", request: "you-1" }, context));
});

test("wake lines (trigger, process, answer) show once, never count as unread, name no thread, and can't be changed", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const game = await chat.agent("game");
  const yourChat = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  const dm = valueOf(await yourChat.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await yourChat.createThread({ channel: dm.id, name: null }, context));
  const yours = await you.host.get(Thread, { thread: thread.id }, context);
  const channel = await you.host.get(Channel, { channel: dm.id }, context);

  // An agent-to-agent DM thread that scout can reference from an answer wake line.
  const gameDm = valueOf(await scouts.openDm({ member: game.you.id }, context));
  const gameThread = valueOf(await scouts.createThread({ channel: gameDm.id, name: "ROM sync" }, context));

  const trigReq = {
    thread: thread.id,
    wake: { kind: "trigger" as const, name: "groceries", firedAt: 1_700_000_000_000, prompt: "Make the week's list.", output: "14" },
    request: "scout-line-1",
  };
  const line = valueOf(await scouts.wakeLine(trigReq, context));
  assert.deepEqual(line.wake, trigReq.wake);
  assert.equal(valueOf(await scouts.wakeLine(trigReq, context)).id, line.id, "a retry shows it once");

  const onceLine = valueOf(
    await scouts.wakeLine(
      {
        thread: thread.id,
        wake: { kind: "trigger", name: null, firedAt: 1_700_000_001_000, prompt: "Check back on the deploy.", output: null },
        request: "scout-line-once",
      },
      context,
    ),
  );
  assert.deepEqual(onceLine.wake, { kind: "trigger", name: null, firedAt: 1_700_000_001_000, prompt: "Check back on the deploy.", output: null });

  const procLine = valueOf(
    await scouts.wakeLine(
      {
        thread: thread.id,
        wake: { kind: "process", id: "proc_1", command: "curl -fLo thing.tar https://example.com", state: "exited", code: 0, afterMs: 660_000, at: 1_700_000_002_000, output: "100% done" },
        request: "scout-line-proc",
      },
      context,
    ),
  );
  assert.equal(procLine.wake?.kind, "process");
  assert.equal(procLine.wake.code, 0);

  const ansLine = valueOf(
    await scouts.wakeLine(
      {
        thread: thread.id,
        wake: { kind: "answer", from: game.you.id, thread: gameThread.id, status: "answered", at: 1_700_000_003_000 },
        request: "scout-line-ans",
      },
      context,
    ),
  );
  assert.deepEqual(ansLine.wake, {
    kind: "answer",
    from: { id: game.you.id, kind: game.you.kind, name: game.you.name },
    thread: gameThread.id,
    title: "ROM sync",
    status: "answered",
    at: 1_700_000_003_000,
  });

  await until(() => yours.messages.value.length === 4, "all four wake lines to arrive");
  assert.equal(yours.unread.value, 0, "wake lines never count as unread");
  assert.equal(channel.unread.value?.[thread.id], 0);
  assert.equal(yours.thread.value?.preview, null);
  refusalOf(await yourChat.wakeLine({ ...trigReq, request: "you-1" }, context));
  refusalOf(await scouts.edit({ message: line.id, text: "No.", request: "scout-2" }, context));
  refusalOf(await yourChat.react({ message: line.id, emoji: "👀", request: "you-2" }, context));
});

test("archiving a thread clears its unread count, and unarchiving restores it", { timeout }, async (t) => {
  const chat = await startChatInProcess(t);
  const you = await chat.person();
  const scout = await chat.agent("scout");
  const yourChat = await you.host.get(Chat, {}, context);
  const scouts = await scout.host.get(Chat, {}, context);
  const dm = valueOf(await yourChat.openDm({ member: scout.you.id }, context));
  const thread = valueOf(await yourChat.createThread({ channel: dm.id, name: "Sync" }, context));
  const watching = await you.host.get(Thread, { thread: thread.id }, context);
  const channel = await you.host.get(Channel, { channel: dm.id }, context);

  valueOf(await scouts.post({ thread: thread.id, text: "All done.", request: "scout-done" }, context));
  await until(() => watching.unread.value === 1 && channel.unread.value?.[thread.id] === 1, "unread to reach 1");

  const archived = valueOf(await yourChat.archive({ thread: thread.id, archived: true, revision: thread.revision }, context));
  await until(() => watching.unread.value === 0 && channel.unread.value?.[thread.id] === 0, "archiving to clear unread");

  valueOf(await yourChat.archive({ thread: thread.id, archived: false, revision: archived.revision }, context));
  await until(() => watching.unread.value === 1 && channel.unread.value?.[thread.id] === 1, "unarchiving to restore unread");
});
