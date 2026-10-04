import assert from "node:assert/strict";
import { test } from "node:test";
import type { Member, Message } from "../../contracts/chat/index.ts";
import { wakes } from "./feed.ts";

// IDs mean nothing, so any will do for members who only have to be told apart.
const zach: Member = { id: "mem_a", kind: "person", name: "zach" };
const scout: Member = { id: "mem_b", kind: "agent", name: "scout" };
const helper: Member = { id: "mem_c", kind: "agent", name: "helper" };

function message(overrides: Partial<Message>): Message {
  return {
    id: "msg_1",
    seq: 1,
    channelId: "ch_1",
    threadId: "th_1",
    author: zach,
    text: "hello",
    sentAt: 0,
    addressed: [scout.id],
    receipts: [],
    ...overrides,
  };
}

test("a message addressed to the agent wakes it, but not its own messages, ones meant for others, or ones it already left a receipt on", () => {
  assert.equal(wakes(scout, message({})), true);
  assert.equal(wakes(scout, message({ author: helper })), true);

  // The agent's own reply comes back in its feed, and answering it would never end.
  assert.equal(wakes(scout, message({ author: scout, addressed: [zach.id] })), false);
  assert.equal(wakes(scout, message({ addressed: ["mem_d", "mem_e"] })), false);
  const receipt = { memberId: scout.id, status: "skipped" as const, reply: null, detail: null };
  assert.equal(wakes(scout, message({ receipts: [receipt] })), false);
  assert.equal(wakes(scout, message({ receipts: [{ ...receipt, memberId: helper.id }] })), true);
});
