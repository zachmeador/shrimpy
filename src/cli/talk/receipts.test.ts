import assert from "node:assert/strict";
import { test } from "node:test";
import type { Member, Message, Receipt, ThreadView } from "../../contracts/chat/index.ts";
import { waitForReceipt } from "./receipts.ts";

const scout: Member = { id: "mem_a", kind: "agent", name: "scout" };
const zach: Member = { id: "mem_b", kind: "person", name: "zach" };

function message(id: string, seq: number, receipts: Receipt[] = []): Message {
  return {
    id,
    seq,
    event: `evt_${seq}`,
    channelId: "ch_1",
    threadId: "th_1",
    author: zach,
    text: id,
    sentAt: seq,
    editedAt: null,
    deleted: false,
    addressed: [],
    reactions: [],
    receipts,
  };
}

const left = (event: string, status: Receipt["status"]): Receipt => ({ memberId: scout.id, event, status, reply: null, detail: null });

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

test("a receipt that is there already is found at once", async () => {
  const sent = message("msg_1", 1);
  const thread = watchable(view({ ...sent, receipts: [left(sent.event, "silent")] }));

  const waited = await waitForReceipt(thread.handle, sent, scout.id, new AbortController().signal);

  assert.ok(waited.kind === "receipt");
  assert.equal(waited.receipt.status, "silent");
  assert.equal(thread.listeners.size, 0, "and it stopped watching");
});

test("the receipt waited for is the one on the message's post, not one on a later edit", async () => {
  const sent = message("msg_1", 1);
  const thread = watchable(view({ ...sent, receipts: [left("evt_9", "failed")] }));
  const waiting = waitForReceipt(thread.handle, sent, scout.id, new AbortController().signal);

  thread.publish(view({ ...sent, receipts: [left(sent.event, "answered"), left("evt_9", "failed")] }));

  const waited = await waiting;
  assert.ok(waited.kind === "receipt");
  assert.equal(waited.receipt.status, "answered");
});

test("a message the live view has moved past is reported, so the wait does not go on for nothing", async () => {
  const sent = message("msg_1", 1);
  const thread = watchable(view(sent));
  const waiting = waitForReceipt(thread.handle, sent, scout.id, new AbortController().signal);

  thread.publish(view(message("msg_300", 300)));

  assert.deepEqual(await waiting, { kind: "moved-on" });
  assert.equal(thread.listeners.size, 0);
});
