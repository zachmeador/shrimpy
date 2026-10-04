import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember, type Message, personMember, type Receipt, type ThreadView } from "../../contracts/chat/index.ts";
import { waitForReceipt } from "./receipts.ts";

const scout = agentMember("scout");
const zach = personMember("zach");

function message(id: string, seq: number, receipts: Receipt[] = []): Message {
  return { id, seq, channelId: "ch_1", threadId: "th_1", author: zach, text: id, sentAt: seq, addressed: [], receipts };
}

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
  const silent: Receipt = { memberId: scout.id, status: "silent", reply: null, detail: null };
  const thread = watchable(view(message("msg_1", 1, [silent])));

  const waited = await waitForReceipt(thread.handle, "msg_1", scout.id, new AbortController().signal);

  assert.ok(waited.kind === "receipt");
  assert.equal(waited.receipt.status, "silent");
  assert.equal(thread.listeners.size, 0, "and it stopped watching");
});

test("a message the live view has moved past is reported, so the wait does not go on for nothing", async () => {
  const thread = watchable(view(message("msg_1", 1)));
  const waiting = waitForReceipt(thread.handle, "msg_1", scout.id, new AbortController().signal);

  thread.publish(view(message("msg_300", 300)));

  assert.deepEqual(await waiting, { kind: "moved-on" });
  assert.equal(thread.listeners.size, 0);
});
