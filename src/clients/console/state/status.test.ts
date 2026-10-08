import assert from "node:assert/strict";
import { test } from "node:test";
import { toolItem, userItem, workingView } from "../../../contracts/agent/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import { statusOf } from "./status.ts";
import { agentMember, aChatServer, aListing, aModel, anAgent, aRoom, aSession, aThread, aThreadView, onThread } from "./testing/index.ts";

const scout = agentMember("scout");

test("in an agent's DM it finds the agent, what it is doing in the thread, what its session says, and how many of its other sessions work", () => {
  const busy = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: 0 }] });
  const view = workingView([userItem("go"), toolItem("bash")], { kind: "tool", name: "bash" });
  view.status.queued = [{ mode: "followUp", text: "and the logs?" }];
  const model = onThread("scout", busy, aThreadView(busy, []), { session: view });
  const sessions = [aSession("th_1", { working: true }), aSession("th_2", { working: true }), aSession("trigger:nightly", { working: true }), aSession("th_3")];

  const status = statusOf(model, sessions, 1234);

  assert.deepEqual(status, {
    at: 1234,
    about: {
      kind: "agent",
      name: "scout",
      running: true,
      version: SHRIMPY_VERSION,
      reached: true,
      doing: { kind: "tool", name: "bash" },
      session: { queued: 1, model: view.status.model, own: false, defaultModel: undefined, usage: view.status.usage },
      othersWorking: 2,
    },
  });
});

test("an agent that cannot be reached is found as the gateway and chat say, and not as its session last showed", () => {
  const busy = aThread("th_1", { preview: "go", working: [{ memberId: scout.id, since: 0 }] });
  const lost = { state: "down" as const, why: { kind: "lost" as const } };
  const model = onThread("scout", busy, undefined, { session: workingView([userItem("go")]), agent: lost });

  const about = statusOf(model, undefined, 1)?.about;

  assert.deepEqual(about, {
    kind: "agent",
    name: "scout",
    running: true,
    version: SHRIMPY_VERSION,
    reached: false,
    doing: { kind: "working" },
    session: undefined,
    othersWorking: undefined,
  });
});

test("in a room it finds each agent in it, whether it is running and whether it is working in the thread", () => {
  const inRoom = aThread("th_2", { preview: "go", working: [{ memberId: scout.id, since: 0 }] });
  const model = aModel({
    where: { screen: "thread", place: { kind: "room", id: "ch_2" }, thread: "th_2" },
    listing: aListing([anAgent("scout"), aChatServer()], undefined, ["bob"]),
    rooms: { ch_2: aRoom("ops", ["scout", "bob"], [inRoom]) },
  });

  const about = statusOf(model, undefined, 1)?.about;

  assert.deepEqual(about, {
    kind: "room",
    agents: [
      { name: "bob", running: false, working: false },
      { name: "scout", running: true, working: true },
    ],
  });
});
