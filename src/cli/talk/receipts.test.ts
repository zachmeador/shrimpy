import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember, type Message, personMember, type Receipt, type ThreadView } from "../../contracts/chat/index.ts";
import { waitForReceipt } from "./receipts.ts";

const scout = agentMember("scout");
const rex = agentMember("rex");
const zach = personMember("zach");

function message(id: string, seq: number, receipts: Receipt[] = [], author = zach): Message {
  return { id, seq, channelId: "ch_1", threadId: "th_1", author, text: id, sentAt: seq, addressed: [], receipts };
}

const answered = (memberId: string, reply: string): Receipt => ({ memberId, status: "answered", reply, detail: null });
const silent = (memberId: string): Receipt => ({ memberId, status: "silent", reply: null, detail: null });

function view(...messages: Message[]): ThreadView {
  const thread = { id: "th_1", channelId: "ch_1", main: false, name: null, preview: null, archived: false, updatedAt: 0, working: [] };
  return { thread, messages, earlier: 0 };
}

/** A thread the test publishes views to, as the chat server does. */
function watchable(first: ThreadView) {
  const listeners = new Set<(view: ThreadView) => void>();
  return {
    listeners,
    handle: {
      subscribe(listener: (view: ThreadView) => void) {
        listeners.add(listener);
        listener(first);
        return () => void listeners.delete(listener);
      },
    },
    publish: (next: ThreadView) => [...listeners].forEach((listener) => listener(next)),
  };
}

test("it resolves when the member's receipt arrives, with the reply it points at", async () => {
  const thread = watchable(view(message("msg_1", 1)));
  const waiting = waitForReceipt(thread.handle, "msg_1", scout.id, new AbortController().signal);

  thread.publish(view(message("msg_1", 1), message("msg_2", 2, [], scout)));
  thread.publish(view(message("msg_1", 1, [answered(scout.id, "msg_2")]), message("msg_2", 2, [], scout)));

  const waited = await waiting;
  assert.ok(waited.kind === "receipt");
  assert.equal(waited.receipt.status, "answered");
  assert.equal(waited.reply?.id, "msg_2");
  assert.equal(thread.listeners.size, 0, "it stopped watching");
});

test("a receipt that is there already is found at once", async () => {
  const thread = watchable(view(message("msg_1", 1, [silent(scout.id)])));

  const waited = await waitForReceipt(thread.handle, "msg_1", scout.id, new AbortController().signal);

  assert.ok(waited.kind === "receipt");
  assert.equal(waited.receipt.status, "silent");
  assert.equal(waited.reply, undefined);
  assert.equal(thread.listeners.size, 0);
});

test("another member's receipt is not the one waited for", async () => {
  const thread = watchable(view(message("msg_1", 1, [silent(rex.id)])));
  const waiting = waitForReceipt(thread.handle, "msg_1", scout.id, new AbortController().signal);

  thread.publish(view(message("msg_1", 1, [silent(rex.id), { ...silent(scout.id), status: "skipped" }])));

  const waited = await waiting;
  assert.ok(waited.kind === "receipt");
  assert.equal(waited.receipt.status, "skipped");
});

test("a receipt whose reply the thread no longer shows still resolves, without the reply", async () => {
  const thread = watchable(view(message("msg_1", 1, [answered(scout.id, "msg_9")])));

  const waited = await waitForReceipt(thread.handle, "msg_1", scout.id, new AbortController().signal);

  assert.ok(waited.kind === "receipt");
  assert.equal(waited.reply, undefined);
});

test("a message the live view has moved past is reported, so the wait does not go on for nothing", async () => {
  const thread = watchable(view(message("msg_1", 1)));
  const waiting = waitForReceipt(thread.handle, "msg_1", scout.id, new AbortController().signal);

  thread.publish(view(message("msg_300", 300)));

  assert.deepEqual(await waiting, { kind: "moved-on" });
  assert.equal(thread.listeners.size, 0);
});

test("giving up rejects the wait with the reason and stops watching", async () => {
  const thread = watchable(view(message("msg_1", 1)));
  const giveUp = new AbortController();
  const waiting = waitForReceipt(thread.handle, "msg_1", scout.id, giveUp.signal);

  giveUp.abort(new Error("interrupted"));

  await assert.rejects(waiting, /interrupted/);
  assert.equal(thread.listeners.size, 0);
  thread.publish(view(message("msg_1", 1, [silent(scout.id)])));
});

test("a signal that is already aborted never starts watching", async () => {
  const thread = watchable(view(message("msg_1", 1)));
  const giveUp = new AbortController();
  giveUp.abort();

  await assert.rejects(waitForReceipt(thread.handle, "msg_1", scout.id, giveUp.signal), { name: "AbortError" });

  assert.equal(thread.listeners.size, 0);
});
