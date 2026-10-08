import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatEvent, Member } from "../../contracts/chat/index.ts";
import { commandFor } from "./commands.ts";

// IDs mean nothing, so any will do for members who only have to be told apart.
const zach: Member = { id: "mem_a", kind: "person", name: "zach" };
const scout: Member = { id: "mem_b", kind: "agent", name: "scout" };
const helper: Member = { id: "mem_c", kind: "agent", name: "helper" };

type Posted = Extract<ChatEvent, { kind: "posted" }>;

/** A post as the feed offers it: by `actor`, mentioning the members whose IDs are `mentions`. */
function post(text: string, { actor = zach, mentions = [scout.id] }: { actor?: Member; mentions?: string[] } = {}): Posted {
  return {
    id: "evt_1",
    seq: 7,
    at: 2000,
    actor,
    kind: "posted",
    text,
    receipts: [],
    message: { id: "msg_1", channelId: "ch_1", threadId: "th_1", author: actor, sentAt: 1000, mentions, deleted: false, preview: text },
  };
}

test("a command is what a post says when, after any mentions at its start, it begins with /stop as a whole word", () => {
  const stops = (text: string): boolean => commandFor(scout, post(text), "room") === "stop";
  for (const text of ["/stop", "  /stop", "/stop now, please", "/stop.", "/Stop", "@scout /stop", "@all /stop", "@scout @helper /stop", "@scout, /stop", "@scout\n/stop"]) {
    assert.ok(stops(text), text);
  }
  for (const text of ["stop", "let's stop chatting", "please /stop", "/stopwatch", "/stop-it", "/ stop", "@scout stop", "@scout please /stop", "//stop", "@scout/stop"]) {
    assert.equal(stops(text), false, text);
  }
});

test("a command in a room is for the agent when the post mentions it, and when it mentions nobody only if that command is for everyone then; and only a person's post is one", () => {
  const forWhom = (text: string, mentions: string[]) => commandFor(scout, post(text, { mentions }), "room");
  assert.equal(forWhom("/stop", [scout.id]), "stop", "a room where it is mentioned");
  assert.equal(forWhom("/stop", [scout.id, helper.id]), "stop");
  assert.equal(forWhom("/stop", []), "stop", "a room where nobody is, for a command that is then for everyone");
  assert.equal(forWhom("/stop", [helper.id]), undefined, "a room where only someone else is");

  assert.equal(forWhom("@scout /model local/b", [scout.id]), "model");
  assert.equal(forWhom("@all /model local/b", [scout.id, helper.id]), "model", "@all mentions every member");
  assert.equal(forWhom("/model local/b", []), undefined, "a room where nobody is, for a command that is then for nobody");
  assert.equal(forWhom("@helper /model local/b", [helper.id]), undefined);
  assert.equal(commandFor(scout, post("/model local/b", { mentions: [] }), "dm"), "model", "in a DM it is for the agent");

  assert.equal(commandFor(scout, post("/stop", { actor: helper }), "room"), undefined, "an agent's post is only text");
  assert.equal(commandFor(scout, { ...post("/stop"), kind: "edited" }, "room"), undefined, "and so is an edit");
});
