import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MESSAGE_LENGTH } from "../contracts/chat/index.ts";
import { until } from "../lib/testing/index.ts";
import { follow, mainThread, outcome, posted, startDm, startTestChat, texts } from "./testing/index.ts";

const timeout = 30_000;

test("two members talk in a DM", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const shrimpy = await chat.agent("Shrimpy");

  const dm = await zach.chat.openDm(shrimpy.me.id);
  assert.equal(dm.kind, "dm");
  assert.equal(dm.name, "Shrimpy");
  assert.deepEqual(new Set(dm.members.map((member) => member.id)), new Set([zach.me.id, shrimpy.me.id]));
  assert.deepEqual(await zach.chat.channels(), [dm]);
  const fromShrimpy = await shrimpy.chat.channels();
  assert.deepEqual(
    fromShrimpy.map((channel) => [channel.id, channel.name]),
    [[dm.id, zach.me.name]],
  );
  assert.deepEqual(await shrimpy.chat.openDm(zach.me.id), fromShrimpy[0]);

  const main = await mainThread(zach, dm.id);
  const start = await shrimpy.chat.head();
  const offered = shrimpy.chat.feed(start, 10);
  const question = await zach.chat.post(main.id, "Are you there?", "zach-1");
  assert.deepEqual(question.mentions, []);
  assert.deepEqual(question.author, zach.me);
  const [asked, ...others] = await offered;
  assert.deepEqual(others, []);
  assert.ok(asked?.kind === "posted");
  assert.deepEqual([asked.id, asked.seq, asked.text], [question.event, question.seq, "Are you there?"]);
  assert.deepEqual([asked.actor, asked.message.id, asked.message.mentions], [zach.me, question.id, []]);

  const answer = await shrimpy.chat.post(main.id, "Yes.", "shrimpy-1");
  assert.deepEqual(answer.mentions, []);
  assert.deepEqual(posted(await zach.chat.feed(question.seq, 10)), ["Yes."]);
  assert.deepEqual(posted(await shrimpy.chat.feed(question.seq, 10)), ["Yes."], "a member is offered its own events too");
  assert.deepEqual(await zach.chat.read(main.id, null, 10), [question, answer]);
  assert.deepEqual(await shrimpy.chat.read(main.id, answer.seq, 10), [question]);

  const [after] = await zach.chat.threads(dm.id);
  assert.ok(after);
  assert.equal(after.preview, "Are you there?");
  assert.equal(after.updatedAt, answer.sentAt);
});

test("a DM can be opened with a member on the roster who has not come in yet, and with nobody else", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const newcomer = await chat.member("Newcomer");
  const dm = await zach.chat.openDm(newcomer.id);
  const main = await mainThread(zach, dm.id);
  const waiting = await zach.chat.post(main.id, "Whenever you get here.", "zach-1");
  await assert.rejects(zach.chat.openDm("mem_nobody"), /There is no member mem_nobody on the roster/);

  const arrived = await chat.agent("Newcomer");

  assert.equal(arrived.me.id, newcomer.id);
  const [channel] = await arrived.chat.channels();
  assert.ok(channel);
  assert.equal(channel.id, dm.id);
  assert.equal(channel.name, zach.me.name);
  assert.deepEqual(await arrived.chat.read(main.id, null, 10), [waiting]);
  assert.equal(await arrived.chat.head(), waiting.seq);
});

test("side threads keep their own conversations in the channel", { timeout }, async (t) => {
  const { zach, shrimpy, dm, main } = await startDm(t);

  const side = await zach.chat.createThread(dm.id, "Trip");
  await zach.chat.post(side.id, "Where to?", "zach-1");
  await shrimpy.chat.post(main.id, "Back in the main thread.", "shrimpy-1");
  const renamed = await shrimpy.chat.renameThread(side.id, "Holiday");
  const archived = await zach.chat.archiveThread(side.id, true);

  assert.equal(renamed.name, "Holiday");
  assert.equal(archived.archived, true);
  assert.deepEqual(texts(await zach.chat.read(side.id, null, 10)), ["Where to?"]);
  assert.deepEqual(texts(await zach.chat.read(main.id, null, 10)), ["Back in the main thread."]);
  const threads = await shrimpy.chat.threads(dm.id);
  assert.deepEqual(
    threads.map((thread) => [thread.id, thread.name, thread.archived, thread.preview]),
    [
      [main.id, null, false, "Back in the main thread."],
      [side.id, "Holiday", true, "Where to?"],
    ],
  );
});

test("a thread that someone started with a command for agents is listed by the first message in it that is neither a command nor an agent's line about one, and by nothing before one", { timeout }, async (t) => {
  const { zach, shrimpy, dm } = await startDm(t);
  const side = await zach.chat.createThread(dm.id, null);
  const preview = async (): Promise<string | null | undefined> =>
    (await zach.chat.threads(dm.id)).find((thread) => thread.id === side.id)?.preview;

  const first = await zach.chat.post(side.id, "@Shrimpy /model local/big", "zach-1");
  await zach.chat.post(side.id, "/stop", "zach-2");
  assert.equal(await preview(), null, "a thread of commands has nothing to be named for");

  const line = await shrimpy.chat.post(side.id, "This thread runs on local/big now.", "shrimpy-1");
  await shrimpy.chat.leaveReceipt([first.event], outcome("answered", { reply: line.id }));
  assert.equal(await preview(), null, "nor is it named for what an agent said about a command");

  await zach.chat.post(side.id, "Is the build green?", "zach-3");
  assert.equal(await preview(), "Is the build green?");

  await zach.chat.edit(first.id, "Never mind the model.");
  assert.equal(await preview(), "Never mind the model.", "the preview follows an edit that makes a command a message");
});

test("a feed catches up after a reconnect", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const first = await chat.agent("Shrimpy");
  const dm = await zach.chat.openDm(first.me.id);
  const main = await mainThread(zach, dm.id);
  await zach.chat.post(main.id, "one", "zach-1");
  const [seen] = await first.chat.feed(0, 10);
  assert.ok(seen);

  await first.close();
  await zach.chat.post(main.id, "two", "zach-2");
  await zach.chat.post(main.id, "three", "zach-3");
  const second = await chat.agent("Shrimpy");

  const missed = await second.chat.feed(seen.seq, 10);
  assert.deepEqual(posted(missed), ["two", "three"]);

  const waiting = second.chat.feed(missed.at(-1)?.seq ?? 0, 10);
  await zach.chat.post(main.id, "four", "zach-4");
  assert.deepEqual(posted(await waiting), ["four"]);
});

test("a feed pages through what it missed", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  for (const number of [1, 2, 3, 4, 5]) await zach.chat.post(main.id, `m${number}`, `zach-${number}`);

  const firstPage = await shrimpy.chat.feed(0, 2);
  const secondPage = await shrimpy.chat.feed(firstPage.at(-1)?.seq ?? 0, 2);
  const lastPage = await shrimpy.chat.feed(secondPage.at(-1)?.seq ?? 0, 2);

  assert.deepEqual(posted(firstPage), ["m1", "m2"]);
  assert.deepEqual(posted(secondPage), ["m3", "m4"]);
  assert.deepEqual(posted(lastPage), ["m5"]);
});

test("a retried post returns the first message instead of posting twice", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);

  const first = await zach.chat.post(main.id, "Once.", "request-1");
  const retry = await zach.chat.post(main.id, "Once.", "request-1");
  const sameRequestFromAnother = await shrimpy.chat.post(main.id, "Once.", "request-1");

  assert.deepEqual(retry, first);
  assert.notEqual(sameRequestFromAnother.id, first.id);
  assert.deepEqual(texts(await zach.chat.read(main.id, null, 10)), ["Once.", "Once."]);
  await assert.rejects(zach.chat.post(main.id, "Something else.", "request-1"), {
    code: "service_invalid_value",
    message: /Request request-1 already posted a different message/,
  });
  assert.equal((await zach.chat.read(main.id, null, 10)).length, 2);
});

test("a post whose acknowledgment was lost is not posted again by its retry", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const dm = await zach.chat.openDm((await chat.member("Shrimpy")).id);
  const main = await mainThread(zach, dm.id);
  const sender = await chat.person();

  // The server gets the post, and the connection goes before the answer can be read.
  const lost = sender.chat.post(main.id, "Did this arrive?", "zach-1");
  lost.catch(() => undefined);
  await sender.close();
  const [arrived] = await zach.chat.read(main.id, null, 10);
  assert.ok(arrived);

  const retry = await zach.chat.post(main.id, "Did this arrive?", "zach-1");

  assert.deepEqual(retry, arrived);
  assert.deepEqual(texts(await zach.chat.read(main.id, null, 10)), ["Did this arrive?"]);
});

test("a connection keeps working while its own feed waits", { timeout }, async (t) => {
  const { shrimpy, main } = await startDm(t);
  const start = await shrimpy.chat.head();

  const waiting = shrimpy.chat.feed(start, 10);
  await shrimpy.chat.setWorking(main.id, true);
  const reply = await shrimpy.chat.post(main.id, "Answering while I listen.", "shrimpy-1");

  assert.equal(await shrimpy.chat.head(), reply.seq);
  assert.deepEqual(posted(await waiting), [reply.text]);
});

test("a waiting feed ends when its caller cancels it, and the connection carries on", { timeout }, async (t) => {
  const { zach, shrimpy, main } = await startDm(t);
  const start = await shrimpy.chat.head();

  const controller = new AbortController();
  const cancelled = shrimpy.chat.feed(start, 10, controller.signal);
  // The server takes up a connection's calls in order, so once it has answered this one it has the feed.
  await shrimpy.chat.head();
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });

  const waiting = shrimpy.chat.feed(start, 10);
  await zach.chat.post(main.id, "still listening", "zach-1");
  assert.deepEqual(posted(await waiting), ["still listening"]);
});

test("a waiting feed ends when its connection drops, and the server carries on", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const gone = await chat.agent("Shrimpy");
  const dm = await zach.chat.openDm(gone.me.id);
  const main = await mainThread(zach, dm.id);
  const start = await gone.chat.head();
  const abandoned = follow(gone.chat.feed(start, 10));
  // The server takes up a connection's calls in order, so once it has answered this one it has the feed.
  await gone.chat.head();

  await gone.close();
  await until(() => abandoned.done, "the waiting feed to end once its connection was closed");

  const stays = await chat.agent("Shrimpy");
  const waiting = stays.chat.feed(start, 10);
  await zach.chat.post(main.id, "anyone there?", "zach-1");
  assert.deepEqual(posted(await waiting), ["anyone there?"]);
});

test("a message of the longest allowed size makes it through, and a longer one does not", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const dm = await zach.chat.openDm((await chat.member("Shrimpy")).id);
  const main = await mainThread(zach, dm.id);

  const longest = await zach.chat.post(main.id, "é".repeat(MAX_MESSAGE_LENGTH), "zach-1");

  assert.equal(longest.text.length, MAX_MESSAGE_LENGTH);
  await assert.rejects(zach.chat.post(main.id, "é".repeat(MAX_MESSAGE_LENGTH + 1), "zach-2"), {
    message: /at most 400000 characters/,
  });
});
