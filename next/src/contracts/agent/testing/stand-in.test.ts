import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { isNotListening } from "../../../lib/connection/index.ts";
import { until, useRuntimeDir, waitForView } from "../../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import { startStandInGateway } from "../../gateway/testing/index.ts";
import { assistantItem, sessionView, startStandInAgent, toolItem, userItem, workingView } from "./index.ts";

const timeout = 15_000;

async function startAgent(t: TestContext) {
  useRuntimeDir(t);
  return startStandInAgent(t, { name: "scout" });
}

test("sessions are listed with their thread and channel, and whether they have work", { timeout }, async (t) => {
  const stand = await startAgent(t);
  stand.agent.session("th_one", { channelId: "ch_one" });
  stand.agent.session("th_busy", { channelId: "ch_one", view: workingView([userItem("go")]) });
  stand.agent.session("th_queued", {
    channelId: "ch_two",
    view: sessionView({ status: { queued: [{ mode: "followUp", text: "next" }] } }),
  });
  const client = await stand.join();

  assert.deepEqual(await client.sessions(), [
    { threadId: "th_one", channelId: "ch_one", working: false },
    { threadId: "th_busy", channelId: "ch_one", working: true },
    { threadId: "th_queued", channelId: "ch_two", working: true },
  ]);
});

test("an attached session shows its view and follows each change", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const session = stand.agent.session("th_one", { view: sessionView({ items: [userItem("hello")] }) });
  const client = await stand.join();

  const watched = await client.attach("th_one");

  assert.equal(watched.threadId, "th_one");
  assert.deepEqual(watched.view.items, [userItem("hello")]);
  const streaming = waitForView(watched, (view) => view.items.length === 3 && view.status.busy);
  session.update((view) => {
    view.items.push(assistantItem("Let me look.", { streaming: true }), toolItem("bash", { args: { command: "ls" } }));
    view.status.busy = true;
    view.status.activity = { kind: "tool", name: "bash" };
  });
  assert.equal((await streaming).items[2]?.type, "tool");
  const settled = waitForView(watched, (view) => !view.status.busy);
  session.show(sessionView({ items: [userItem("hello"), assistantItem("Done.")] }));
  assert.equal((await settled).items.length, 2);
});

test("a thread the agent has no session for yet is refused with the agent's own words", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const client = await stand.join();

  await assert.rejects(client.attach("th_none"), {
    code: "service_invalid_value",
    message: "This agent has no session for thread th_none yet.",
  });
  stand.agent.session("th_none");
  assert.equal((await client.attach("th_none")).threadId, "th_none");
});

test("stopping and steering are counted for the test, and stops can be made to fail", { timeout }, async (t) => {
  const stand = await startAgent(t);
  const session = stand.agent.session("th_one", { view: workingView([userItem("go")]) });
  const watched = await (await stand.join()).attach("th_one");

  await watched.stop();
  await watched.steer("and this", "request-1");
  session.failStops("the work would not stop");
  await assert.rejects(watched.stop(), /the work would not stop/);
  session.failStops(undefined);
  await watched.stop();

  assert.equal(session.stops, 3);
  assert.deepEqual(session.steered, ["and this"]);
});

test("an outage cuts the connections and keeps the sessions, and the agent comes back as the same server", { timeout }, async (t) => {
  const stand = await startAgent(t);
  stand.agent.session("th_one");
  const client = await stand.join();
  const lost = new Promise<Error | undefined>((resolve) => client.onDisconnect(resolve));

  await stand.outage();

  await lost;
  await until(() => stand.connections() === 0, "the connections to close");
  await assert.rejects(stand.join(), (error: unknown) => isNotListening(error));
  await stand.recover();
  assert.deepEqual(
    (await (await stand.join()).sessions()).map((session) => session.threadId),
    ["th_one"],
  );
});

test("it registers with the gateway as the agent it stands for, with the version it is given", { timeout }, async (t) => {
  useRuntimeDir(t);
  const gateway = await startStandInGateway(t);

  const first = await startStandInAgent(t, { name: "scout", register: true });
  const second = await startStandInAgent(t, { name: "mechanic", register: true, version: "9.9.9" });

  await until(() => gateway.registered().length === 2, "both agents to register");
  assert.deepEqual(gateway.registered(), [
    { kind: "agent", name: "scout", serverId: first.serverId, socket: first.socket, pid: process.pid, version: SHRIMPY_VERSION },
    { kind: "agent", name: "mechanic", serverId: second.serverId, socket: second.socket, pid: process.pid, version: "9.9.9" },
  ]);
});
