import assert from "node:assert/strict";
import { hostname } from "node:os";
import { test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { MAX_MESSAGE_LENGTH } from "../../../contracts/chat/index.ts";
import { Roster } from "../../../contracts/gateway/index.ts";
import { connectGateway, joinAsMachine, readMachine } from "../../../contracts/gateway/node.ts";
import { linkTestAgent, startTestGateway } from "../../../contracts/gateway/testing/index.ts";
import { settle, stopAfter, tempDir, until, within } from "../../../lib/testing/index.ts";
import { agentEntries, type Model } from "./index.ts";
import { startRig } from "./testing/index.ts";

/*
 * The console's state against the real gateway and chat server, in processes of their own, with small agents' programs
 * linked to the gateway that serve nothing but their presence and work in chat through their links. What an agent's
 * sessions show is in the tests that open the console from the command line, on agents that run a model.
 */

const timeout = 30_000;

const textsOf = (model: Model): string[] => model.thread?.messages.map((message) => message.text) ?? [];

test("with one agent it goes straight to that agent's threads", { timeout }, async (t) => {
  const rig = await startRig(t);

  const model = await rig.until((each) => each.where.screen === "threads", "the only agent's threads");

  assert.deepEqual(model.where, { screen: "threads", place: { kind: "agent", name: "scout" } });
  assert.deepEqual(model.gateway, { state: "up" });
});

test("with several agents it shows them all, and whether each is working in a thread of the person's", { timeout }, async (t) => {
  const rig = await startRig(t, { agents: ["scout", "mechanic"] });
  const thread = await rig.thread("scout", "check the disk");
  await rig.dm("mechanic");

  const listed = await rig.until((model) => agentEntries(model).length === 2, "both agents to be listed");
  assert.deepEqual(listed.where, { screen: "agents" }, "with a choice, the person makes it");
  assert.deepEqual(
    agentEntries(listed).map((entry) => [entry.name, entry.running, entry.working]),
    [
      ["mechanic", true, false],
      ["scout", true, false],
    ],
  );
  const working = await rig.asAgent("scout");
  await working.setWorking(thread.id, true);

  await rig.until((model) => agentEntries(model).find((entry) => entry.name === "scout")?.working === true, "scout to be working");
  assert.equal(agentEntries(rig.state.model()).find((entry) => entry.name === "mechanic")?.working, false);
  await working.setWorking(thread.id, false);
  await rig.until((model) => agentEntries(model).every((entry) => !entry.working), "scout to be done");
});

test("an agent the person has not talked to has no threads, and viewing it makes none", { timeout }, async (t) => {
  const rig = await startRig(t);
  await rig.until((model) => model.where.screen === "threads" && model.chat.state === "up", "the agent's threads");
  await settle();

  assert.deepEqual(rig.state.model().dms, {});
  assert.deepEqual(await (await rig.person()).channels(), []);
});

test("an open thread follows what is said in it, by the person here, by anyone elsewhere, and by the agent", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads", "the threads");

  rig.state.openThread(thread.id);

  await rig.until((model) => textsOf(model).length === 1, "the thread's view");
  await (await rig.asAgent("scout")).post(thread.id, "second");
  await rig.until((model) => textsOf(model).length === 2, "the agent's reply");
  assert.deepEqual(textsOf(rig.state.model()), ["first", "second"]);
  assert.deepEqual(rig.state.model().where, { screen: "thread", place: { kind: "agent", name: "scout" }, thread: thread.id });
});

test("a thread that cannot be opened says so, in chat's words", { timeout }, async (t) => {
  const rig = await startRig(t);
  await rig.until((model) => model.where.screen === "threads", "the threads");

  rig.state.openThread("th_nothing");

  const model = await rig.until((each) => each.notice !== undefined, "the notice");
  assert.ok(model.notice?.kind === "not-opened" && "said" in model.notice.problem && model.notice.problem.said.includes("th_nothing"), JSON.stringify(model.notice));
});

test("saying something posts it as the person to the open thread, and a new thread comes to be with its first message and is then open", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");

  assert.deepEqual(await rig.state.send("and this"), { ok: true });
  await rig.until((model) => textsOf(model).length === 2, "the new message in the view");
  const [, posted] = await (await rig.person()).read(thread.id, null, 10);
  assert.deepEqual([posted?.author.id, posted?.text], [(await rig.person()).me.id, "and this"]);

  rig.state.back();
  rig.state.startThread();
  assert.deepEqual(rig.state.model().where, { screen: "thread", place: { kind: "agent", name: "scout" }, thread: undefined });
  assert.deepEqual(await rig.state.send("a fresh topic"), { ok: true });
  const started = await rig.until((each) => each.where.screen === "thread" && each.where.thread !== undefined, "the new thread to open");
  assert.notEqual(started.where.screen === "thread" && started.where.thread, thread.id);
  await rig.until((each) => textsOf(each).join() === "a fresh topic", "the first message in the view");
  await rig.until((each) => each.dms.scout?.threads.some((one) => one.preview === "a fresh topic") === true, "the thread to be listed");
});

test("a message that is not sent says why and is left to the person to send again; the notice goes away by itself", { timeout }, async (t) => {
  const rig = await startRig(t, { noticeMs: 60 });
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");

  const sent = await rig.state.send("x".repeat(MAX_MESSAGE_LENGTH + 1));

  assert.deepEqual(sent, { ok: false });
  const { notice } = rig.state.model();
  assert.ok(notice?.kind === "not-sent" && "said" in notice.problem, JSON.stringify(notice));
  assert.deepEqual((await (await rig.person()).read(thread.id, null, 10)).map((message) => message.text), ["first"]);
  await rig.until((model) => model.notice === undefined, "the notice to go");
});

test("a message to a chat server that has stopped answering is not left in limbo, and sending it again once chat answers does not post it twice", { timeout }, async (t) => {
  const rig = await startRig(t, { sendMs: 300 });
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads" && model.chat.state === "up", "the chat server");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");
  rig.chat.freeze();

  const sent = await rig.state.send("hello");

  assert.deepEqual(sent, { ok: false });
  assert.deepEqual(rig.state.model().notice, { kind: "not-sent", problem: { down: { kind: "unreachable", message: "the chat server did not answer" } } });
  // The chat server had the message all along, and takes it when it runs again.
  rig.chat.thaw();
  await rig.until((model) => textsOf(model).length === 2, "the message the chat server had");
  assert.deepEqual(await rig.state.send("hello"), { ok: true });
  assert.deepEqual((await (await rig.person()).read(thread.id, null, 10)).map((message) => message.text), ["first", "hello"]);
});

test("leaving does not wait for a chat server that has stopped answering", { timeout }, async (t) => {
  const rig = await startRig(t);
  await rig.until((model) => model.where.screen === "threads" && model.chat.state === "up", "the chat server");

  rig.chat.freeze();
  stopAfter(t, () => rig.chat.thaw());

  assert.equal(await within(3000, rig.state.farewell(), "working out what is left running"), undefined);
  await within(5000, rig.state.close(), "letting go");
});

test("while chat is away it says so and sends nothing, and when chat is back the thread is followed again", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");

  await rig.chat.outage();

  await rig.until((model) => model.chat.state === "down", "the loss to be noticed");
  assert.deepEqual(await rig.state.send("into the void"), { ok: false });
  assert.equal(rig.state.model().notice?.kind, "not-sent");
  assert.deepEqual(textsOf(rig.state.model()), ["first"], "what was on screen stays");
  await rig.chat.recover();

  await rig.until((model) => model.chat.state === "up", "chat to be back");
  await (await rig.asAgent("scout")).post(thread.id, "back again");
  await rig.until((model) => textsOf(model).length === 2, "the thread to follow what is said");
  assert.deepEqual(await rig.state.send("and now"), { ok: true });
});

test("going back leaves the thread, then the agent, and what was followed is let go of", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "go");
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");

  rig.state.back();
  assert.deepEqual(rig.state.model().where, { screen: "threads", place: { kind: "agent", name: "scout" } });
  assert.equal(rig.state.model().thread, undefined);
  await (await rig.asAgent("scout")).post(thread.id, "unheard");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(rig.state.model().thread, undefined, "the thread is no longer followed");

  rig.state.back();
  assert.deepEqual(rig.state.model().where, { screen: "agents" });
  assert.equal(rig.state.model().agent, undefined);
});

test("leaving names the agent still working and the thread it is working in, and nothing when it is idle", { timeout }, async (t) => {
  const rig = await startRig(t);
  const busy = await rig.thread("scout", "go");
  const other = await rig.thread("scout", "something else");
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(other.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");

  assert.equal(await rig.state.farewell(), undefined);
  const working = await rig.asAgent("scout");
  await working.setWorking(busy.id, true);

  await rig.until((model) => model.dms.scout?.threads.some((thread) => thread.id === busy.id && thread.working.length === 1) === true, "the work to be listed");
  assert.deepEqual(await rig.state.farewell(), { agent: "scout", thread: busy.id });
  await working.setWorking(other.id, true);
  await rig.until((model) => model.thread?.thread.working.length === 1, "the open thread to show the work");
  assert.deepEqual(await rig.state.farewell(), { agent: "scout", thread: other.id }, "the thread on screen first");
});

test("with no gateway running it says so, and picks everything up once the gateway, the chat server and an agent are there", { timeout }, async (t) => {
  const rig = await startRig(t, { noGateway: true });

  const model = await rig.until((each) => each.gateway.state === "down" && each.gateway.why.kind === "not-running", "the gateway to be missing");

  assert.deepEqual(model.where, { screen: "agents" });
  assert.deepEqual(agentEntries(model), []);
  await startTestGateway(t);
  await linkTestAgent(t, "scout");
  await rig.until((each) => each.gateway.state === "up", "the gateway");
  await rig.until((each) => each.chat.state === "up", "the chat server to link and be reached");
  await rig.until((each) => each.where.screen === "threads", "the agent to be listed and gone to");
});

test("the person's devices are listed, and taking one back ends its link to the gateway", { timeout }, async (t) => {
  const gateway = await startTestGateway(t, { listen: [{ host: "127.0.0.1", port: 0 }] });
  const rig = await startRig(t);
  const [address] = gateway.listening;
  assert.ok(address);
  // A machine of the person's joins with an invitation, as `shrimpy invite` and `shrimpy join` make it, and links in with its token.
  const person = await gateway.connect();
  const roster = await person.host.get(Roster, {}, BACKGROUND_CONTEXT);
  stopAfter(t, () => roster.release());
  const invited = await roster.inviteDevice(BACKGROUND_CONTEXT);
  assert.ok(invited.kind === "done");
  const folder = tempDir(t, "machine");
  const { code, fingerprint } = invited.value;
  await joinAsMachine(folder, { name: null, address, code, fingerprint });
  const kept = readMachine(folder);
  assert.ok(kept !== undefined);
  const device = await connectGateway({ place: kept.gateway, token: kept.token });
  stopAfter(t, () => device.close());
  await rig.until((model) => model.where.screen === "threads", "the agent's screen");
  rig.state.startThread();

  rig.state.readDevices();

  const listed = rig.state.model().status;
  assert.ok(listed?.about.kind === "devices", JSON.stringify(listed));
  assert.deepEqual(listed.about.devices.map((each) => each.label), [hostname()]);
  await rig.state.takeBack(hostname());
  assert.deepEqual(rig.state.model().notice, { kind: "taken-back", device: hostname() });
  await within(10_000, device.closed, "the device's link to end");
  const after = rig.state.model().status;
  assert.ok(after?.about.kind === "devices" && after.about.devices.length === 0, "the list on show says it is gone");
  await until(() => roster.ways.value.every((way) => way.kind !== "device"), "the roster to have no device");
});
