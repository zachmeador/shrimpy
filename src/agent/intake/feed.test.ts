import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember, type Message } from "../../contracts/chat/index.ts";
import { wakes } from "./feed.ts";
import { scout, zach } from "./testing/index.ts";

function message(overrides: Partial<Message>): Message {
  return {
    id: "msg_1",
    seq: 1,
    channelId: "ch_1",
    threadId: "th_1",
    author: zach,
    text: "hello",
    sentAt: 0,
    addressed: ["agent:scout"],
    receipts: [],
    ...overrides,
  };
}

test("a message addressed to the agent wakes it, but not its own messages, ones meant for others, or ones it already left a receipt on", () => {
  assert.equal(wakes(scout, message({})), true);
  assert.equal(wakes(scout, message({ author: agentMember("helper") })), true);

  // The agent's own reply comes back in its feed, and answering it would never end.
  assert.equal(wakes(scout, message({ author: scout, addressed: ["person:zach"] })), false);
  assert.equal(wakes(scout, message({ addressed: ["person:alice", "agent:other"] })), false);
  const receipt = { memberId: "agent:scout", status: "skipped" as const, reply: null, detail: null };
  assert.equal(wakes(scout, message({ receipts: [receipt] })), false);
  assert.equal(wakes(scout, message({ receipts: [{ ...receipt, memberId: "agent:other" }] })), true);
});
