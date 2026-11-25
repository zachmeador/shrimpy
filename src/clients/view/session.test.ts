import assert from "node:assert/strict";
import { test } from "node:test";
import { agentMember, aListing, aRoom, aSession, aThread, aThreadView, anAgent, aChatServer, onSession, onThread, sessionView, workingView } from "../state/testing/index.ts";
import { sessionLevel, threadLevel } from "./index.ts";

const at = { now: Date.now(), self: "this test" };

test("the agent's view of a thread says where it is, what the session is doing with which model and at what cost, and whose views there are", () => {
  const [scout, lurker] = ["scout", "lurker"].map(agentMember);
  assert.ok(scout && lurker);
  const main = aThread("th_1", { pinned: 1, name: "general", channelId: "ch_2" });
  const room = { kind: "room" as const, id: "ch_2" };
  const busy = workingView([], { kind: "tool", name: "bash" });
  busy.status.queued.push({ when: "next_turn", text: "and the logs" });
  busy.status.model = { provider: "local", id: "small" };
  busy.status.usage = { input: 48_210, output: 1_902, cost: 0 };
  const model = onThread("scout", main, aThreadView(main, []), {
    open: { list: { kind: "agent", id: scout.id }, item: { kind: "thread", place: room, thread: main.id, side: scout.id } },
    listing: aListing([anAgent("scout"), anAgent("lurker"), aChatServer()]),
    rooms: { ch_2: aRoom("ops", ["scout", "lurker"], [main]) },
    behind: { [scout.id]: busy, [lurker.id]: sessionView() },
  });

  const view = sessionLevel(model, at);
  assert.ok(view);
  for (const fact of ["#ops", "general"]) assert.ok(view.watching.includes(fact), fact);
  for (const fact of ["bash", "1 waiting", "local/small", "48,210", "1,902"]) assert.ok(view.foot?.includes(fact), fact);
  assert.deepEqual(
    view.sides.map((side) => side.agent),
    [scout.id, lurker.id],
  );
  assert.ok(threadLevel(model, at)?.works[0]?.doing.includes("bash"), "the work beside the conversation says what the agent is doing too");
});

test("a trigger's own session has nothing under its steps", () => {
  const nightly = aSession("trigger:nightly", { place: { kind: "trigger", trigger: "nightly" }, working: true });
  const view = sessionLevel(onSession("scout", nightly, workingView([])), at);
  assert.ok(view);
  assert.equal(view.foot, undefined);
  assert.deepEqual(view.sides, []);
});
