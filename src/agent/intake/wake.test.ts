import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent, Member, Receipt } from "../../contracts/chat/index.ts";
import { DEFAULT_WAKE_POLICY, type WakePolicy } from "./policy.ts";
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

const wakes = (event: ChatEvent, policy: WakePolicy = DEFAULT_WAKE_POLICY): boolean => takeUp(scout, event, policy) !== undefined;

test("what wakes the agent depends on the room's policy, and the default wakes it for a mention, a person's message that mentions nobody, an answer to its own and a reaction to one", () => {
  // What each policy does with one kind of message: the agent is mentioned, someone else is, nobody is, by a person or an agent.
  const messages = {
    "a person mentions the agent": anEvent({ addressed: [scout.id] }),
    "a person mentions someone else": anEvent({ addressed: ["mem_d"] }),
    "a person mentions nobody": anEvent({ addressed: [] }),
    "a person edits a message that mentions nobody": anEvent({ kind: "edited", addressed: [] }),
    "an agent mentions the agent": anEvent({ actor: helper, addressed: [scout.id] }),
    "an agent mentions someone else": anEvent({ actor: helper, addressed: ["mem_d"] }),
    "an agent mentions nobody": anEvent({ actor: helper, addressed: [] }),
    "an agent edits a message that mentions nobody": anEvent({ kind: "edited", actor: helper, addressed: [] }),
    "a person reacts to a message of the agent's": anEvent({ kind: "reacted", author: scout, addressed: [helper.id] }),
  };
  const woken = (policy: WakePolicy): string[] => Object.entries(messages).filter(([, event]) => wakes(event, policy)).map(([what]) => what);

  assert.deepEqual(woken("none"), [], "nothing, a reaction included");
  assert.deepEqual(woken("mentions"), [
    "a person mentions the agent",
    "an agent mentions the agent",
    "a person reacts to a message of the agent's",
  ]);
  // A person who names someone else is talking to them, and a person who names nobody is talking to the room.
  assert.deepEqual(woken("people"), [
    "a person mentions the agent",
    "a person mentions nobody",
    "a person edits a message that mentions nobody",
    "an agent mentions the agent",
    "a person reacts to a message of the agent's",
  ]);
  assert.deepEqual(woken("all"), Object.keys(messages));
  assert.deepEqual(woken(DEFAULT_WAKE_POLICY), woken("people"));

  // Whatever the policy but none, a reaction to someone else's message, taking a reaction back and a delete wake nobody.
  for (const policy of ["mentions", "people", "all"] as const) {
    assert.equal(wakes(anEvent({ kind: "reacted", author: zach }), policy), false);
    assert.equal(wakes(anEvent({ kind: "reacted", author: helper, addressed: [zach.id] }), policy), false);
    assert.equal(wakes(anEvent({ kind: "unreacted", author: scout, addressed: [zach.id] }), policy), false);
    assert.equal(wakes(anEvent({ kind: "deleted" }), policy), false);
    // What the agent does itself never wakes it: its own reply comes back in its feed, and answering it would never end.
    assert.equal(wakes(anEvent({ kind: "posted", actor: scout, addressed: [zach.id] }), policy), false);
    assert.equal(wakes(anEvent({ kind: "reacted", actor: scout, author: scout, addressed: [zach.id] }), policy), false);
    // Nor does an event of a message that was deleted since, or one the agent already left a receipt on.
    for (const kind of ["posted", "edited", "reacted"] as const) {
      assert.equal(wakes(anEvent({ kind, author: kind === "reacted" ? scout : zach, deleted: true }), policy), false, kind);
    }
    const receipt = { memberId: scout.id, event: "evt_1", status: "skipped" as const, reply: null, detail: null };
    assert.equal(wakes(anEvent({ receipts: [receipt] }), policy), false);
    assert.equal(wakes(anEvent({ receipts: [{ ...receipt, memberId: helper.id }] }), policy), true);
  }

  // A receipt wakes nobody, except one that says another member answered a message of the agent's own that was for them,
  // whose reply the agent will ask for, under every policy but none.
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: scout, addressed: [helper.id] })), false, "silent");
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: zach })), false);
  const answer = anEvent({ kind: "receipted", actor: helper, author: scout, addressed: [helper.id], answered: true });
  for (const policy of ["mentions", "people", "all"] as const) assert.equal(takeUp(scout, answer, policy)?.kind, "answer", policy);
  assert.equal(wakes(answer, "none"), false);
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: scout, addressed: [zach.id], answered: true })), false, "it was not for them");
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: zach, addressed: [helper.id], answered: true })), false, "it is not the agent's message");
  assert.equal(wakes(anEvent({ kind: "receipted", actor: helper, author: scout, addressed: [helper.id], answered: true, deleted: true })), false);
});
