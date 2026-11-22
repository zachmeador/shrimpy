import assert from "node:assert/strict";
import { test } from "node:test";
import { type Model, nextSide } from "./model.ts";
import { aChatServer, agentMember, aListing, aModel, anAgent, sessionView } from "./testing/index.ts";

test("each agent's view of the session behind a thread comes on show in turn, the list's agent first, then the conversation", () => {
  const [scout, lurker, mechanic] = ["scout", "lurker", "mechanic"].map(agentMember);
  assert.ok(scout && lurker && mechanic);
  const room = { kind: "room" as const, id: "ch_2" };
  const on = (side: string | undefined): Model =>
    aModel({
      listing: aListing([anAgent("scout"), anAgent("lurker"), anAgent("mechanic"), aChatServer()]),
      open: { list: { kind: "agent", id: scout.id }, item: { kind: "thread", place: room, thread: "th_1", side } },
      behind: { [mechanic.id]: sessionView(), [scout.id]: sessionView(), [lurker.id]: sessionView() },
    });
  const sides: (string | undefined)[] = [];
  let side: string | undefined;
  for (let turn = 0; turn < 4; turn += 1) {
    side = nextSide(on(side));
    sides.push(side);
  }

  assert.deepEqual(sides, [scout.id, lurker.id, mechanic.id, undefined]);
  assert.equal(nextSide({ ...on(undefined), behind: {} }), undefined, "with no session behind the thread, the conversation stays");
  assert.equal(nextSide({ ...on(lurker.id), behind: { [scout.id]: sessionView() } }), undefined, "and a view whose session went gives way to it");
});
