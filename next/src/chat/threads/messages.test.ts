import assert from "node:assert/strict";
import { test } from "node:test";
import type { TestContext } from "node:test";
import { agent, openTestDeps, person, refused } from "../testing/index.ts";
import {
  createThread,
  identify,
  listThreads,
  markSkipped,
  openDm,
  post,
  readMessages,
} from "./index.ts";
import { previewOf } from "./messages.ts";

function setup(t: TestContext) {
  const { deps, clock } = openTestDeps(t);
  const zach = identify(deps, person("Zach"));
  const shrimpy = identify(deps, agent("Shrimpy"));
  const alice = identify(deps, person("Alice"));
  const dm = openDm(deps, zach, shrimpy);
  const [main] = listThreads(deps, zach, dm.id);
  if (main === undefined) throw new Error("the DM has no main thread");
  return { deps, clock, zach, shrimpy, alice, dm, main };
}

test("a post is stored with its author, its time and who it is addressed to", (t) => {
  const { deps, clock, zach, shrimpy, dm, main } = setup(t);
  clock.advance();

  const message = post(deps, zach, main.id, "Hello there", "request-1");

  assert.deepEqual(message, {
    id: message.id,
    seq: 1,
    channelId: dm.id,
    threadId: main.id,
    author: zach,
    text: "Hello there",
    sentAt: clock.now(),
    addressed: [shrimpy.id],
    skippedBy: [],
  });
  assert.deepEqual(readMessages(deps, shrimpy, main.id, null, 10), [message]);

  clock.advance();
  const reply = post(deps, shrimpy, main.id, "Hi!", "request-1");
  assert.deepEqual(reply.addressed, [zach.id]);
  assert.equal(reply.seq, 2);
});

test("a thread's preview is the start of its first message, and its time follows the newest", (t) => {
  const { deps, clock, zach, shrimpy, dm, main } = setup(t);
  const side = createThread(deps, zach, dm.id, null);

  clock.advance();
  post(deps, zach, side.id, "  First   words\nof the thread  ", "r1");
  clock.advance();
  const newest = post(deps, shrimpy, side.id, "A later answer", "r2");

  const threads = listThreads(deps, zach, dm.id);
  const updated = threads.find((thread) => thread.id === side.id);
  const untouched = threads.find((thread) => thread.id === main.id);
  assert.ok(updated && untouched);
  assert.equal(updated.preview, "First words of the thread");
  assert.equal(updated.updatedAt, newest.sentAt);
  assert.equal(untouched.preview, null);
  assert.equal(untouched.updatedAt, main.updatedAt);
});

test("a preview is one line of at most 80 characters", () => {
  assert.equal(previewOf("one\n\ntwo\tthree"), "one two three");
  assert.equal(previewOf("x".repeat(200)), "x".repeat(80));
  assert.equal(previewOf("😀".repeat(100)), "😀".repeat(80));
});

test("a retry gets the first message back, and does not post twice", (t) => {
  const { deps, zach, shrimpy, main } = setup(t);

  const first = post(deps, zach, main.id, "once", "request-1");
  const retry = post(deps, zach, main.id, "once", "request-1");
  const sameRequestFromAnother = post(deps, shrimpy, main.id, "once", "request-1");

  assert.deepEqual(retry, first);
  assert.notEqual(sameRequestFromAnother.id, first.id);
  assert.equal(readMessages(deps, zach, main.id, null, 10).length, 2);
});

test("a request reused for a different message is refused, not mistaken for a retry", (t) => {
  const { deps, zach, dm, main } = setup(t);
  const side = createThread(deps, zach, dm.id, null);
  post(deps, zach, main.id, "the first one", "request-1");

  assert.throws(
    () => post(deps, zach, main.id, "something else", "request-1"),
    refused(/Request request-1 already posted a different message/),
  );
  assert.throws(
    () => post(deps, zach, side.id, "the first one", "request-1"),
    refused(/already posted a different message/),
  );
  assert.equal(readMessages(deps, zach, main.id, null, 10).length, 1);
  assert.equal(readMessages(deps, zach, side.id, null, 10).length, 0);
});

test("only a member of the channel posts to its threads or reads them", (t) => {
  const { deps, zach, alice, main } = setup(t);
  post(deps, zach, main.id, "private", "request-1");

  assert.throws(() => post(deps, alice, main.id, "let me in", "r"), refused(/^Unknown thread: th_/));
  assert.throws(() => readMessages(deps, alice, main.id, null, 10), refused(/^Unknown thread: th_/));
  assert.throws(() => post(deps, zach, "th_nothing", "hello", "r"), refused(/^Unknown thread: th_nothing/));
  assert.equal(readMessages(deps, zach, main.id, null, 10).length, 1);
});

test("what a post is made of is checked", (t) => {
  const { deps, zach, main } = setup(t);

  assert.throws(() => post(deps, zach, main.id, "", "r"), refused(/needs some text/));
  assert.throws(() => post(deps, zach, main.id, "x".repeat(20_001), "r"), refused(/at most 20000 characters/));
  assert.throws(() => post(deps, zach, main.id, "hi", ""), refused(/^requestId must be an ID/));
  assert.throws(() => post(deps, zach, 5, "hi", "r"), refused(/^threadId must be an ID/));
  assert.equal(readMessages(deps, zach, main.id, null, 10).length, 0);
});

test("a thread is read a page at a time, oldest first, and a page has a size limit", (t) => {
  const { deps, zach, main } = setup(t);
  for (let number = 1; number <= 205; number++) {
    post(deps, zach, main.id, `message ${number}`, `request-${number}`);
  }

  const newest = readMessages(deps, zach, main.id, null, 3);
  assert.deepEqual(
    newest.map((message) => message.text),
    ["message 203", "message 204", "message 205"],
  );
  assert.deepEqual(
    readMessages(deps, zach, main.id, newest[0]?.seq ?? 0, 2).map((message) => message.text),
    ["message 201", "message 202"],
  );
  const biggest = readMessages(deps, zach, main.id, null, 10_000);
  assert.equal(biggest.length, 200);
  assert.equal(biggest[0]?.text, "message 6");
  assert.deepEqual(readMessages(deps, zach, main.id, 1, 10), []);
});

test("reading is checked", (t) => {
  const { deps, zach, main } = setup(t);

  assert.throws(() => readMessages(deps, zach, main.id, null, 0), refused(/^limit must be a whole number/));
  assert.throws(() => readMessages(deps, zach, main.id, -1, 5), refused(/^beforeSeq must be a whole number/));
  assert.throws(() => readMessages(deps, zach, main.id, "5", 5), refused(/^beforeSeq must be a whole number/));
});

test("an agent can mark messages it had waiting as skipped", (t) => {
  const { deps, zach, shrimpy, main } = setup(t);
  const first = post(deps, zach, main.id, "are you there", "r1");
  const second = post(deps, zach, main.id, "hello?", "r2");

  markSkipped(deps, shrimpy, [first.id, second.id]);
  markSkipped(deps, shrimpy, [first.id]);

  assert.deepEqual(
    readMessages(deps, zach, main.id, null, 10).map((message) => message.skippedBy),
    [[shrimpy.id], [shrimpy.id]],
  );
});

test("skips are an agent's to mark, on messages it can see, all or none", (t) => {
  const { deps, zach, shrimpy, main } = setup(t);
  const outsider = identify(deps, agent("Outsider"));
  const message = post(deps, zach, main.id, "are you there", "r1");

  assert.throws(() => markSkipped(deps, zach, [message.id]), refused(/Only an agent/));
  assert.throws(() => markSkipped(deps, outsider, [message.id]), refused(/^Unknown message: msg_/));
  assert.throws(
    () => markSkipped(deps, shrimpy, [message.id, "msg_nothing"]),
    refused(/^Unknown message: msg_nothing/),
  );
  assert.throws(() => markSkipped(deps, shrimpy, []), refused(/^messageIds must be a list/));
  assert.deepEqual(readMessages(deps, zach, main.id, null, 10)[0]?.skippedBy, []);
});
