import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent, Member, Receipt } from "../../contracts/chat/index.ts";
import { takeUp } from "./wake.ts";

// IDs mean nothing, so any will do for members who only have to be told apart.
const zach: Member = { id: "mem_a", kind: "person", name: "zach" };
const scout: Member = { id: "mem_b", kind: "agent", name: "scout" };
const helper: Member = { id: "mem_c", kind: "agent", name: "helper" };

interface Parts {
  kind?: ChatEvent["kind"];
  /** Who did it. */
  actor?: Member;
  /** Who wrote the message it names. */
  author?: Member;
  addressed?: string[];
  deleted?: boolean;
  receipts?: Receipt[];
  /** What a receipt says: silent, unless it is an answer, which points at a reply. */
  answered?: boolean;
}

function anEvent({
  kind = "posted",
  actor = zach,
  author = actor,
  addressed = [scout.id],
  deleted = false,
  receipts = [],
  answered = false,
}: Parts = {}): ChatEvent {
  const base = {
    id: "evt_1",
    seq: 7,
    at: 2000,
    actor,
    receipts,
    message: { id: "msg_1", channelId: "ch_1", threadId: "th_1", author, sentAt: 1000, addressed, deleted, preview: "Shall I deploy it now?" },
  };
  switch (kind) {
    case "posted":
    case "edited":
      return { ...base, kind, text: "hello" };
    case "deleted":
      return { ...base, kind };
    case "reacted":
    case "unreacted":
      return { ...base, kind, emoji: "👍" };
    case "receipted":
      return answered
        ? { ...base, kind, event: "evt_0", status: "answered", reply: "msg_2", detail: null }
        : { ...base, kind, event: "evt_0", status: "silent", reply: null, detail: null };
  }
}

const wakes = (event: ChatEvent): boolean => takeUp(scout, event) !== undefined;

test("the default wake policy: a post or an edit addressed to the agent, a reaction to a message it wrote and an answer to one, and nothing else", () => {
  assert.equal(wakes(anEvent({ kind: "posted" })), true);
  assert.equal(wakes(anEvent({ kind: "posted", actor: helper })), true);
  assert.equal(wakes(anEvent({ kind: "edited" })), true);
  assert.equal(wakes(anEvent({ kind: "reacted", author: scout, addressed: [zach.id] })), true);

  // Meant for others.
  assert.equal(wakes(anEvent({ kind: "posted", addressed: ["mem_d", "mem_e"] })), false);
  assert.equal(wakes(anEvent({ kind: "edited", addressed: ["mem_d"] })), false);
  // A reaction to someone else's message, taking a reaction back, and a delete.
  assert.equal(wakes(anEvent({ kind: "reacted", author: zach })), false);
  assert.equal(wakes(anEvent({ kind: "reacted", author: helper, addressed: [zach.id] })), false);
  assert.equal(wakes(anEvent({ kind: "unreacted", author: scout, addressed: [zach.id] })), false);
  assert.equal(wakes(anEvent({ kind: "deleted" })), false);
  // A receipt wakes nobody, except one that says another member answered a message of the agent's own that was for them,
  // whose reply the agent will ask for.
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: scout, addressed: [helper.id] })), false, "silent");
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: zach })), false);
  assert.deepEqual(takeUp(scout, anEvent({ kind: "receipted", actor: helper, author: scout, addressed: [helper.id], answered: true }))?.kind, "answer");
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: scout, addressed: [zach.id], answered: true })), false, "it was not for them");
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: zach, addressed: [helper.id], answered: true })), false, "it is not the agent's message");
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: scout, addressed: [helper.id], answered: true, deleted: true })), false);

  // What the agent does itself never wakes it: its own reply comes back in its feed, and answering it would never end.
  assert.equal(wakes(anEvent({ kind: "posted", actor: scout, addressed: [zach.id] })), false);
  assert.equal(wakes(anEvent({ kind: "reacted", actor: scout, author: scout, addressed: [zach.id] })), false);
  // Nor does an event of a message that was deleted since, or one the agent already left a receipt on.
  for (const kind of ["posted", "edited", "reacted"] as const) {
    assert.equal(wakes(anEvent({ kind, author: kind === "reacted" ? scout : zach, deleted: true })), false, kind);
  }
  const receipt = { memberId: scout.id, event: "evt_1", status: "skipped" as const, reply: null, detail: null };
  assert.equal(wakes(anEvent({ receipts: [receipt] })), false);
  assert.equal(wakes(anEvent({ receipts: [{ ...receipt, memberId: helper.id }] })), true);
});
