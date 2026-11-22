import assert from "node:assert/strict";
import { test } from "node:test";
import type { Holdings } from "./holdings.ts";
import { createMoves } from "./moves.ts";
import { createStore } from "./store.ts";
import { aChatServer, agentMember, aListing, aModel, anAgent, sessionView } from "./testing/index.ts";

test("each agent's view of the session behind a thread is put on show in turn, the list's agent first, then the conversation", () => {
  const [scout, lurker, mechanic] = ["scout", "lurker", "mechanic"].map(agentMember);
  assert.ok(scout && lurker && mechanic);
  const room = { kind: "room" as const, id: "ch_2" };
  const model = aModel({
    listing: aListing([anAgent("scout"), anAgent("lurker"), anAgent("mechanic"), aChatServer()]),
    open: { list: { kind: "agent", id: scout.id }, item: { kind: "thread", place: room, thread: "th_1", side: undefined } },
    behind: { [mechanic.id]: sessionView(), [scout.id]: sessionView(), [lurker.id]: sessionView() },
  });
  const store = createStore(model, { noticeMs: 1000, worked: (each) => each, follow: () => undefined });
  // Putting a view on show asks nothing of what is held.
  const moves = createMoves(store, {} as Holdings);
  const sides: (string | undefined)[] = [];
  for (let turn = 0; turn < 4; turn += 1) {
    moves.turnOver();
    const { item } = store.model().open;
    sides.push(item?.kind === "thread" ? item.side : "none");
  }

  assert.deepEqual(sides, [scout.id, lurker.id, mechanic.id, undefined]);
});
