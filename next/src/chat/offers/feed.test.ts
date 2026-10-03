import assert from "node:assert/strict";
import { test } from "node:test";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import { settle } from "../../lib/testing/index.ts";
import { agent, countWatchers, follow, openTestDeps, person, refused } from "../testing/index.ts";
import { createThread, identify, listThreads, openDm, post } from "../threads/index.ts";
import { feed, head } from "./index.ts";

function setup(t: Parameters<typeof openTestDeps>[0]) {
  const { deps } = openTestDeps(t);
  const zach = identify(deps, person("Zach"));
  const shrimpy = identify(deps, agent("Shrimpy"));
  const other = identify(deps, agent("Other"));
  const dm = openDm(deps, zach, shrimpy);
  const otherDm = openDm(deps, zach, other);
  const [main] = listThreads(deps, zach, dm.id);
  const [otherMain] = listThreads(deps, zach, otherDm.id);
  assert.ok(main && otherMain);
  return { deps, zach, shrimpy, other, dm, main, otherMain };
}

const texts = (messages: { text: string }[]): string[] => messages.map((message) => message.text);

test("the head is where the log ends, across every channel", (t) => {
  const { deps, zach, main, otherMain } = setup(t);
  assert.equal(head(deps.store), 0);

  post(deps, zach, main.id, "one", "r1");
  const last = post(deps, zach, otherMain.id, "two", "r2");

  assert.equal(head(deps.store), last.seq);
});

test("a feed gives the messages after the cursor in the caller's channels, oldest first", async (t) => {
  const { deps, zach, shrimpy, main, otherMain } = setup(t);
  const first = post(deps, zach, main.id, "one", "r1");
  post(deps, zach, otherMain.id, "not for shrimpy", "r2");
  post(deps, shrimpy, main.id, "two, shrimpy's own", "r3");
  post(deps, zach, main.id, "three", "r4");

  const all = await feed(deps.store, shrimpy, 0, 10, BACKGROUND_CONTEXT);
  const afterFirst = await feed(deps.store, shrimpy, first.seq, 10, BACKGROUND_CONTEXT);
  const page = await feed(deps.store, shrimpy, 0, 2, BACKGROUND_CONTEXT);

  assert.deepEqual(texts(all), ["one", "two, shrimpy's own", "three"]);
  assert.deepEqual(texts(afterFirst), ["two, shrimpy's own", "three"]);
  assert.deepEqual(texts(page), ["one", "two, shrimpy's own"]);
  assert.deepEqual(
    all.map((message) => message.seq),
    all.map((message) => message.seq).toSorted((a, b) => a - b),
  );
});

test("a page has a size limit, and a feed can be followed page by page", async (t) => {
  const { deps, zach, shrimpy, main } = setup(t);
  for (let number = 1; number <= 205; number++) {
    post(deps, zach, main.id, `message ${number}`, `request-${number}`);
  }

  const first = await feed(deps.store, shrimpy, 0, 10_000, BACKGROUND_CONTEXT);
  const rest = await feed(deps.store, shrimpy, first.at(-1)?.seq ?? 0, 10_000, BACKGROUND_CONTEXT);

  assert.equal(first.length, 200);
  assert.deepEqual(texts(rest), ["message 201", "message 202", "message 203", "message 204", "message 205"]);
});

test("a feed with nothing to give waits, and only a message in the caller's channels ends it", async (t) => {
  const { deps, zach, shrimpy, main, otherMain } = setup(t);
  const counted = countWatchers(deps.store);
  post(deps, zach, main.id, "already there", "r0");
  const cursor = head(deps.store);

  const waiting = follow(feed(counted.store, shrimpy, cursor, 10, BACKGROUND_CONTEXT));
  await settle();
  assert.equal(waiting.done, false);
  assert.equal(counted.watching(), 1);

  post(deps, zach, otherMain.id, "not for shrimpy", "r1");
  await settle();
  assert.equal(waiting.done, false);

  post(deps, zach, main.id, "for shrimpy", "r2");
  await settle();
  assert.equal(waiting.done, true);
  assert.deepEqual(texts(waiting.value ?? []), ["for shrimpy"]);
  assert.equal(counted.watching(), 0);
});

test("a member that starts at the head is offered nothing from before", async (t) => {
  const { deps, zach, shrimpy, main } = setup(t);
  post(deps, zach, main.id, "from before shrimpy asked", "r1");
  const start = head(deps.store);

  const waiting = follow(feed(deps.store, shrimpy, start, 10, BACKGROUND_CONTEXT));
  await settle();
  assert.equal(waiting.done, false);

  post(deps, zach, main.id, "after", "r2");
  await settle();
  assert.deepEqual(texts(waiting.value ?? []), ["after"]);
});

test("a feed that is cancelled ends with the reason, and stops waiting", async (t) => {
  const { deps, shrimpy } = setup(t);
  const counted = countWatchers(deps.store);
  const controller = new AbortController();
  const waiting = follow(
    feed(counted.store, shrimpy, 0, 10, withAbortSignal(controller.signal, BACKGROUND_CONTEXT)),
  );
  await settle();
  assert.equal(counted.watching(), 1);

  const reason = new Error("Client disconnected");
  controller.abort(reason);
  await settle();

  assert.equal(waiting.error, reason);
  assert.equal(counted.watching(), 0);
});

test("a member waits on its own channels when another member is waiting too", async (t) => {
  const { deps, zach, shrimpy, other, main, otherMain } = setup(t);
  const forShrimpy = follow(feed(deps.store, shrimpy, 0, 10, BACKGROUND_CONTEXT));
  const forOther = follow(feed(deps.store, other, 0, 10, BACKGROUND_CONTEXT));
  await settle();

  post(deps, zach, otherMain.id, "to the other agent", "r1");
  await settle();
  assert.equal(forShrimpy.done, false);
  assert.deepEqual(texts(forOther.value ?? []), ["to the other agent"]);

  post(deps, zach, main.id, "to shrimpy", "r2");
  await settle();
  assert.deepEqual(texts(forShrimpy.value ?? []), ["to shrimpy"]);
});

test("a thread started in a channel does not wake a feed, but its first message does", async (t) => {
  const { deps, zach, shrimpy, dm } = setup(t);
  const waiting = follow(feed(deps.store, shrimpy, 0, 10, BACKGROUND_CONTEXT));
  await settle();

  const side = createThread(deps, zach, dm.id, "Side");
  await settle();
  assert.equal(waiting.done, false);

  post(deps, zach, side.id, "first in the side thread", "r1");
  await settle();
  assert.deepEqual(texts(waiting.value ?? []), ["first in the side thread"]);
});

test("a feed is checked, and a cursor past the end is refused instead of waited on", async (t) => {
  const { deps, zach, shrimpy, main } = setup(t);
  post(deps, zach, main.id, "one", "r1");

  await assert.rejects(feed(deps.store, shrimpy, 5, 10, BACKGROUND_CONTEXT), refused(/cursor 5 is past the newest message, 1/));
  await assert.rejects(feed(deps.store, shrimpy, -1, 10, BACKGROUND_CONTEXT), refused(/^cursor must be a whole number/));
  await assert.rejects(feed(deps.store, shrimpy, 0, 0, BACKGROUND_CONTEXT), refused(/^limit must be a whole number/));
  await assert.rejects(feed(deps.store, shrimpy, "0", 10, BACKGROUND_CONTEXT), refused(/^cursor must be a whole number/));
});
