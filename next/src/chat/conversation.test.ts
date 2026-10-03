import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_MESSAGE_LENGTH } from "../contracts/chat/index.ts";
import { settle } from "../lib/testing/index.ts";
import { agent, follow, mainThread, person, startTestChat, texts } from "./testing/index.ts";

const timeout = 30_000;

test("two members talk in a DM", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const shrimpy = await chat.join(agent("Shrimpy"));

  const dm = await zach.chat.openDm(agent("Shrimpy"));
  assert.equal(dm.kind, "dm");
  assert.equal(dm.name, "Shrimpy");
  assert.deepEqual(dm.members, [agent("Shrimpy"), person("Zach")]);
  assert.deepEqual(await zach.chat.channels(), [dm]);
  const fromShrimpy = await shrimpy.chat.channels();
  assert.deepEqual(
    fromShrimpy.map((channel) => [channel.id, channel.name]),
    [[dm.id, "Zach"]],
  );
  assert.deepEqual(await shrimpy.chat.openDm(person("Zach")), fromShrimpy[0]);

  const main = await mainThread(zach, dm.id);
  const start = await shrimpy.chat.head();
  const offered = shrimpy.chat.feed(start, 10);
  const question = await zach.chat.post(main.id, "Are you there?", "zach-1");
  assert.deepEqual(question.addressed, [agent("Shrimpy").id]);
  assert.deepEqual(question.author, person("Zach"));
  assert.deepEqual(await offered, [question]);

  const answer = await shrimpy.chat.post(main.id, "Yes.", "shrimpy-1");
  assert.deepEqual(answer.addressed, [person("Zach").id]);
  assert.deepEqual(await zach.chat.feed(question.seq, 10), [answer]);
  assert.deepEqual(await zach.chat.read(main.id, null, 10), [question, answer]);
  assert.deepEqual(await shrimpy.chat.read(main.id, answer.seq, 10), [question]);

  const [after] = await zach.chat.threads(dm.id);
  assert.ok(after);
  assert.equal(after.preview, "Are you there?");
  assert.equal(after.updatedAt, answer.sentAt);
});

test("a DM can be opened with a member who has not connected yet", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const dm = await zach.chat.openDm(agent("Newcomer"));
  const main = await mainThread(zach, dm.id);
  const waiting = await zach.chat.post(main.id, "Whenever you get here.", "zach-1");

  const newcomer = await chat.join(agent("Newcomer"));

  const [channel] = await newcomer.chat.channels();
  assert.ok(channel);
  assert.equal(channel.id, dm.id);
  assert.equal(channel.name, "Zach");
  assert.deepEqual(await newcomer.chat.read(main.id, null, 10), [waiting]);
  assert.equal(await newcomer.chat.head(), waiting.seq);
});

test("a member's new name shows to the others", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const shrimpy = await chat.join(agent("Shrimpy"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  await zach.chat.post(main.id, "hello", "zach-1");

  await zach.chat.identify({ id: "person:zach", kind: "person", name: "Zachariah" });

  assert.equal((await shrimpy.chat.channels())[0]?.name, "Zachariah");
  assert.equal((await shrimpy.chat.read(main.id, null, 10))[0]?.author.name, "Zachariah");
});

test("side threads keep their own conversations in the channel", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const shrimpy = await chat.join(agent("Shrimpy"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);

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

test("a feed catches up after a reconnect", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const first = await chat.join(agent("Shrimpy"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  await zach.chat.post(main.id, "one", "zach-1");
  const [seen] = await first.chat.feed(0, 10);
  assert.ok(seen);

  await first.close();
  await zach.chat.post(main.id, "two", "zach-2");
  await zach.chat.post(main.id, "three", "zach-3");
  const second = await chat.join(agent("Shrimpy"));

  const missed = await second.chat.feed(seen.seq, 10);
  assert.deepEqual(texts(missed), ["two", "three"]);

  const waiting = second.chat.feed(missed.at(-1)?.seq ?? 0, 10);
  await zach.chat.post(main.id, "four", "zach-4");
  assert.deepEqual(texts(await waiting), ["four"]);
});

test("a feed that starts at the head offers nothing from before", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  await zach.chat.post(main.id, "from before", "zach-1");

  const shrimpy = await chat.join(agent("Shrimpy"));
  const start = await shrimpy.chat.head();
  const waiting = follow(shrimpy.chat.feed(start, 10));
  await settle();
  assert.equal(waiting.done, false);

  await zach.chat.post(main.id, "after", "zach-2");
  assert.deepEqual(texts(await shrimpy.chat.feed(start, 10)), ["after"]);
});

test("a feed pages through what it missed", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const shrimpy = await chat.join(agent("Shrimpy"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  for (const number of [1, 2, 3, 4, 5]) await zach.chat.post(main.id, `m${number}`, `zach-${number}`);

  const firstPage = await shrimpy.chat.feed(0, 2);
  const secondPage = await shrimpy.chat.feed(firstPage.at(-1)?.seq ?? 0, 2);
  const lastPage = await shrimpy.chat.feed(secondPage.at(-1)?.seq ?? 0, 2);

  assert.deepEqual(texts(firstPage), ["m1", "m2"]);
  assert.deepEqual(texts(secondPage), ["m3", "m4"]);
  assert.deepEqual(texts(lastPage), ["m5"]);
});

test("a retried post returns the first message instead of posting twice", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const shrimpy = await chat.join(agent("Shrimpy"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);

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
  const zach = await chat.join(person("Zach"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  const sender = await chat.join(person("Zach"));

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
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const shrimpy = await chat.join(agent("Shrimpy"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  const start = await shrimpy.chat.head();

  const waiting = shrimpy.chat.feed(start, 10);
  await shrimpy.chat.setWorking(main.id, true);
  const reply = await shrimpy.chat.post(main.id, "Answering while I listen.", "shrimpy-1");

  assert.equal(await shrimpy.chat.head(), reply.seq);
  assert.deepEqual(await waiting, [reply]);
});

test("a waiting feed ends when its caller cancels it, and the connection carries on", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const shrimpy = await chat.join(agent("Shrimpy"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  const start = await shrimpy.chat.head();

  const controller = new AbortController();
  const cancelled = shrimpy.chat.feed(start, 10, controller.signal);
  await settle();
  controller.abort();
  await assert.rejects(cancelled, { name: "AbortError" });

  const waiting = shrimpy.chat.feed(start, 10);
  await zach.chat.post(main.id, "still listening", "zach-1");
  assert.deepEqual(texts(await waiting), ["still listening"]);
});

test("a waiting feed ends when its connection drops, and the server carries on", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const gone = await chat.join(agent("Shrimpy"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);
  const start = await gone.chat.head();
  const abandoned = follow(gone.chat.feed(start, 10));
  await settle();

  await gone.close();
  await settle();
  assert.equal(abandoned.done, true);

  const stays = await chat.join(agent("Shrimpy"));
  const waiting = stays.chat.feed(start, 10);
  await zach.chat.post(main.id, "anyone there?", "zach-1");
  assert.deepEqual(texts(await waiting), ["anyone there?"]);
});

test("a message of the longest allowed size makes it through, and a longer one does not", { timeout }, async (t) => {
  const chat = await startTestChat(t);
  const zach = await chat.join(person("Zach"));
  const dm = await zach.chat.openDm(agent("Shrimpy"));
  const main = await mainThread(zach, dm.id);

  const longest = await zach.chat.post(main.id, "é".repeat(MAX_MESSAGE_LENGTH), "zach-1");

  assert.equal(longest.text.length, MAX_MESSAGE_LENGTH);
  await assert.rejects(zach.chat.post(main.id, "é".repeat(MAX_MESSAGE_LENGTH + 1), "zach-2"), {
    message: /at most 400000 characters/,
  });
});
