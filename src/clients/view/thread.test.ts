import assert from "node:assert/strict";
import { test } from "node:test";
import { activityWords, modelWords, type SessionActivity } from "../../contracts/agent/index.ts";
import type { Model } from "../state/index.ts";
import { agentMember, aRoom, aThread, aThreadView, onThread, sessionView, workingView } from "../state/testing/index.ts";
import { threadLevel } from "./index.ts";

/*
 * What the open thread's level says of the sessions behind it, from what each agent's session says of itself.
 */

const at = { now: Date.now(), self: "this test" };
const open = aThread("th_1", { preview: "Check the disk" });
const scout = agentMember("scout");
const mechanic = agentMember("mechanic");
const reading: SessionActivity = { kind: "tool", name: "read" };

/** The thread open in a room the person is in with scout and mechanic, from the room's list. */
function inRoom(behind: Model["behind"]): Model {
  const room = aRoom("lab", ["scout", "mechanic"], [open]);
  const place = { kind: "room" as const, id: room.channel.id };
  return onThread("scout", open, aThreadView(open, []), {
    open: { list: place, item: { kind: "thread", place, thread: open.id, side: undefined } },
    rooms: { [room.channel.id]: room },
    behind,
  });
}

test("a thread says what its one working agent is doing, whichever list it was opened from, and not while several work", () => {
  const one = threadLevel(inRoom({ [mechanic.id]: workingView([], reading) }), at)?.working ?? "";
  assert.ok(one.includes(activityWords(reading)), one);

  const both = threadLevel(inRoom({ [mechanic.id]: workingView([], reading), [scout.id]: workingView([]) }), at)?.working ?? "";
  assert.ok(both !== "" && !both.includes(activityWords(reading)), both);
});

test("a DM's thread names its model under the title only while the session has one of its own", () => {
  const model = { provider: "local", id: "chosen-model" };
  const subOf = (ownModel: boolean): string[] =>
    threadLevel(onThread("scout", open, aThreadView(open, []), { behind: { [scout.id]: sessionView({ status: { model, ownModel } }) } }), at)?.sub ?? [];
  assert.ok(subOf(true).includes(modelWords(model)), subOf(true).join(" · "));
  assert.ok(!subOf(false).includes(modelWords(model)), subOf(false).join(" · "));
});
