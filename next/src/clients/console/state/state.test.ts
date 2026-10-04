import assert from "node:assert/strict";
import { test } from "node:test";
import { assistantItem, sessionView, toolItem, userItem, workingView } from "../../../contracts/agent/testing/index.ts";
import { agentMember } from "../../../contracts/chat/index.ts";
import { startStandInGateway } from "../../../contracts/gateway/testing/index.ts";
import { Refusal } from "../../../lib/refusal/index.ts";
import { type Freezable, freezable, until, within } from "../../../lib/testing/index.ts";
import { agentEntries, type Model } from "./index.ts";
import { startRig } from "./testing/index.ts";

const timeout = 15_000;

const scout = agentMember("scout");

const textsOf = (model: Model): string[] => model.thread?.messages.map((message) => message.text) ?? [];

test("with one agent it goes straight to that agent's threads", { timeout }, async (t) => {
  const rig = await startRig(t);

  const model = await rig.until((each) => each.where.screen === "threads", "the only agent's threads");

  assert.deepEqual(model.where, { screen: "threads", agent: "scout" });
  assert.deepEqual(model.gateway, { state: "up" });
});

test("with several agents it shows them all, and whether each is working in a thread of the person's", { timeout }, async (t) => {
  const rig = await startRig(t, { agents: ["scout", "mechanic"] });
  const thread = await rig.thread("scout", "check the disk");
  rig.dm("mechanic");

  const listed = await rig.until((model) => agentEntries(model).length === 2, "both agents to be listed");
  assert.deepEqual(listed.where, { screen: "agents" }, "with a choice, the person makes it");
  assert.deepEqual(
    agentEntries(listed).map((entry) => [entry.name, entry.working]),
    [
      ["mechanic", false],
      ["scout", false],
    ],
  );
  const working = await rig.asAgent("scout");
  await working.chat.setWorking(thread.id, true);

  await rig.until((model) => agentEntries(model).find((entry) => entry.name === "scout")?.working === true, "scout to be working");
  assert.equal(agentEntries(rig.state.model()).find((entry) => entry.name === "mechanic")?.working, false);
  await working.chat.setWorking(thread.id, false);
  await rig.until((model) => agentEntries(model).every((entry) => !entry.working), "scout to be done");
});

test("an agent's threads are the person's, newest first, with whether it is working in each", { timeout }, async (t) => {
  const rig = await startRig(t);
  const older = await rig.thread("scout", "the older one");
  const newer = await rig.thread("scout", "the newer one");
  const working = await rig.asAgent("scout");
  await working.chat.setWorking(older.id, true);
  rig.state.selectAgent("scout");

  const model = await rig.until(
    (each) => (each.dms.scout?.threads.length ?? 0) === 3 && each.dms.scout?.threads.some((thread) => thread.working.length > 0) === true,
    "the threads to be listed with the work",
  );

  const threads = model.dms.scout?.threads ?? [];
  assert.deepEqual(
    threads.map((thread) => [thread.preview, thread.main]),
    [
      ["the newer one", false],
      ["the older one", false],
      [null, true],
    ],
  );
  assert.deepEqual(
    threads.map((thread) => thread.working.map((mark) => mark.memberId)),
    [[], ["agent:scout"], []],
  );
  assert.equal(threads[0]?.id, newer.id);
});

test("an agent the person has not talked to has no threads, and viewing it makes none", { timeout }, async (t) => {
  const rig = await startRig(t);
  await rig.until((model) => model.where.screen === "threads", "the agent's threads");

  await rig.until((model) => model.chat.state === "up", "chat");

  assert.deepEqual(rig.state.model().dms, {});
  assert.deepEqual(await (await rig.chat.join(rig.state.model().me)).chat.channels(), []);
});

test("an open thread follows what is said in it, by the person here, by anyone elsewhere, and by the agent", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads", "the threads");

  rig.state.openThread(thread.id);

  await rig.until((model) => textsOf(model).length === 1, "the thread's view");
  rig.chat.chat.say(scout, thread.id, "second");
  await rig.until((model) => textsOf(model).length === 2, "the agent's reply");
  assert.deepEqual(textsOf(rig.state.model()), ["first", "second"]);
  assert.deepEqual(rig.state.model().where, { screen: "thread", agent: "scout", thread: thread.id });
});

test("the work behind an open thread is watched, and an agent with no session for it yet has nothing to watch", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "go");
  await rig.until((model) => model.where.screen === "threads", "the threads");

  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");
  await new Promise((resolve) => setTimeout(resolve, 80));

  assert.equal(rig.state.model().session, undefined);
  assert.equal(rig.state.model().notice, undefined, "no session is no error");
  const session = rig.agents.scout?.agent.session(thread.id, {
    view: workingView([userItem("go"), toolItem("bash", { args: { command: "ls" } })], { kind: "tool", name: "bash" }),
  });
  await rig.until((model) => model.session?.status.busy === true, "the session to be watched");
  session?.update((view) => view.items.push(assistantItem("Done.", { streaming: true })));
  await rig.until((model) => model.session?.items.length === 3, "the work to move on");
  session?.show(sessionView({ items: [userItem("go"), assistantItem("Done.")] }));
  await rig.until((model) => model.session?.status.busy === false, "the work to settle");
});

test("a thread that cannot be opened says so", { timeout }, async (t) => {
  const rig = await startRig(t);
  await rig.until((model) => model.where.screen === "threads", "the threads");

  rig.state.openThread("th_nothing");

  const model = await rig.until((each) => each.notice !== undefined, "the notice");
  assert.deepEqual(model.notice, { kind: "not-opened", problem: { said: "Unknown thread: th_nothing" } });
});

test("saying something posts it as the person to the open thread, and every client sees it", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");

  const sent = await rig.state.send("and this");

  assert.deepEqual(sent, { ok: true });
  await rig.until((model) => textsOf(model).length === 2, "the new message in the view");
  const posted = rig.chat.chat.messages(thread.id).at(-1);
  assert.deepEqual([posted?.author.id, posted?.text, posted?.addressed], ["person:zach", "and this", ["agent:scout"]]);
});

test("a new thread comes to be with its first message, in the person's DM with the agent, and is then open", { timeout }, async (t) => {
  const rig = await startRig(t);
  await rig.until((model) => model.where.screen === "threads", "the agent");

  rig.state.startThread();
  assert.deepEqual(rig.state.model().where, { screen: "thread", agent: "scout", thread: undefined });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(await (await rig.chat.join(rig.state.model().me)).chat.channels(), [], "nothing exists yet");
  const sent = await rig.state.send("a fresh topic");

  assert.deepEqual(sent, { ok: true });
  const model = await rig.until((each) => each.where.screen === "thread" && each.where.thread !== undefined, "the new thread to open");
  assert.equal(model.where.screen === "thread" && model.where.agent, "scout");
  await rig.until((each) => textsOf(each).length === 1, "the first message in the view");
  assert.deepEqual(textsOf(rig.state.model()), ["a fresh topic"]);
  const listed = await rig.until((each) => each.dms.scout?.threads.some((thread) => thread.preview === "a fresh topic") === true, "the thread to be listed");
  assert.equal(listed.dms.scout?.channel.kind, "dm");
});

test("a message that is not sent says why and is left to the person to send again; the notice goes away by itself", { timeout }, async (t) => {
  const rig = await startRig(t, { noticeMs: 60 });
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");
  rig.chat.chat.fail("post", new Refusal("The disk is full."));

  const sent = await rig.state.send("will not go");

  assert.deepEqual(sent, { ok: false });
  assert.deepEqual(rig.state.model().notice, { kind: "not-sent", problem: { said: "The disk is full." } });
  assert.deepEqual(rig.chat.chat.messages(thread.id).map((message) => message.text), ["first"]);
  await rig.until((model) => model.notice === undefined, "the notice to go");
  assert.deepEqual(await rig.state.send("will not go"), { ok: true });
});

test("a message whose acknowledgment was lost can be sent again without being posted twice", { timeout }, async (t) => {
  const frozen: Freezable[] = [];
  const rig = await startRig(t, {
    transports: (local) => ({
      ...local,
      program(registration) {
        const wrapped = freezable(local.program(registration));
        if (registration.kind === "chat") frozen.push(wrapped);
        return wrapped.transportFactory;
      },
    }),
  });
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads" && model.chat.state === "up", "the chat server");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");

  // The chat server hears the message and its answer never arrives; then the connection goes.
  frozen[0]?.freeze();
  const sending = rig.state.send("hello");
  await until(() => rig.chat.chat.messages(thread.id).length === 2, "the message to reach the chat server");
  await rig.chat.outage();
  const sent = await sending;
  await rig.chat.recover();
  await rig.until((model) => model.chat.state === "up", "the chat server again");
  const again = await rig.state.send("hello");

  assert.deepEqual(sent, { ok: false });
  assert.deepEqual(again, { ok: true });
  assert.deepEqual(rig.chat.chat.messages(thread.id).map((message) => message.text), ["first", "hello"]);
});

test("a message to a chat server that has stopped answering is not left in limbo, and sending it again is safe", { timeout }, async (t) => {
  const frozen: Freezable[] = [];
  const rig = await startRig(t, {
    sendMs: 150,
    transports: (local) => ({
      ...local,
      program(registration) {
        const wrapped = freezable(local.program(registration));
        if (registration.kind === "chat") frozen.push(wrapped);
        return wrapped.transportFactory;
      },
    }),
  });
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads" && model.chat.state === "up", "the chat server");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");

  frozen[0]?.freeze();
  const sent = await rig.state.send("hello");

  assert.deepEqual(sent, { ok: false });
  assert.deepEqual(rig.state.model().notice, {
    kind: "not-sent",
    problem: { down: { kind: "unreachable", message: "the chat server did not answer" } },
  });
  // The chat server did hear it. Once it is reached again, sending it again does not post it twice.
  await until(() => rig.chat.chat.messages(thread.id).length === 2, "the message to reach the chat server");
  await rig.chat.outage();
  await rig.chat.recover();
  await rig.until((model) => model.chat.state === "up", "the chat server again");
  assert.deepEqual(await rig.state.send("hello"), { ok: true });
  assert.deepEqual(rig.chat.chat.messages(thread.id).map((message) => message.text), ["first", "hello"]);
});

test("leaving does not wait for a chat server that has stopped answering", { timeout }, async (t) => {
  const frozen: Freezable[] = [];
  const rig = await startRig(t, {
    transports: (local) => ({
      ...local,
      program(registration) {
        const wrapped = freezable(local.program(registration));
        if (registration.kind === "chat") frozen.push(wrapped);
        return wrapped.transportFactory;
      },
    }),
  });
  await rig.until((model) => model.where.screen === "threads" && model.chat.state === "up", "the chat server");

  frozen[0]?.freeze();

  assert.equal(await within(3000, rig.state.farewell(), "working out what is left running"), undefined);
  await within(5000, rig.state.close(), "letting go");
});

test("while chat is lost it says so and sends nothing, and when chat is back the thread is up to date", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "first");
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => textsOf(model).length === 1, "the thread's view");

  await rig.chat.outage();

  await rig.until((model) => model.chat.state === "down", "the loss to be noticed");
  assert.deepEqual(await rig.state.send("into the void"), { ok: false });
  assert.deepEqual(rig.state.model().notice, { kind: "not-sent", problem: { down: { kind: "lost" } } });
  assert.deepEqual(textsOf(rig.state.model()), ["first"], "what was on screen stays");
  rig.chat.chat.say(scout, thread.id, "while you were away");
  await rig.chat.recover();

  await rig.until((model) => model.chat.state === "up" && textsOf(model).length === 2, "the thread to catch up");
  assert.deepEqual(await rig.state.send("and now"), { ok: true });
});

test("stopping reaches the session behind the open thread when the agent is working, and says so", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "go");
  const session = rig.agents.scout?.agent.session(thread.id, { view: workingView([userItem("go")]) });
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.session?.status.busy === true, "the work to show");

  await rig.state.stop();

  assert.equal(session?.stops, 1);
  assert.deepEqual(rig.state.model().notice, { kind: "stopped" });
});

test("stopping when nothing is working says so and asks no one", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "hello");
  const session = rig.agents.scout?.agent.session(thread.id);
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.session !== undefined, "the session to show");

  await rig.state.stop();

  assert.equal(session?.stops, 0);
  assert.deepEqual(rig.state.model().notice, { kind: "nothing-to-stop" });
});

test("a stop the agent refuses, or cannot hear, says why", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "go");
  const session = rig.agents.scout?.agent.session(thread.id, { view: workingView([userItem("go")]) });
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.session?.status.busy === true, "the work to show");
  session?.failStops("The work would not stop.");

  await rig.state.stop();

  assert.deepEqual(rig.state.model().notice, { kind: "not-stopped", problem: { said: "The work would not stop." } });
  await rig.agents.scout?.outage();
  await rig.until((model) => model.agent?.state === "down", "the loss to be noticed");
  assert.equal(rig.state.model().session?.status.busy, true, "what was on screen stays");

  await rig.state.stop();

  assert.deepEqual(rig.state.model().notice, { kind: "not-stopped", problem: { down: { kind: "lost" } } });
});

test("when the agent comes back the work is watched again", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "go");
  const session = rig.agents.scout?.agent.session(thread.id, { view: workingView([userItem("go")]) });
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.session?.status.busy === true, "the work to show");

  await rig.agents.scout?.outage();
  await rig.until((model) => model.agent?.state === "down", "the loss to be noticed");
  session?.show(sessionView({ items: [userItem("go"), assistantItem("Done.")] }));
  await rig.agents.scout?.recover();

  await rig.until((model) => model.session?.status.busy === false && model.agent?.state === "up", "the work to be watched again");
});

test("going back leaves the thread, then the agent, and what was watched is let go of", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "go");
  rig.agents.scout?.agent.session(thread.id, { view: workingView([userItem("go")]) });
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.session?.status.busy === true, "the work to show");

  rig.state.back();
  assert.deepEqual(rig.state.model().where, { screen: "threads", agent: "scout" });
  assert.equal(rig.state.model().thread, undefined);
  assert.equal(rig.state.model().session, undefined);
  rig.chat.chat.say(scout, thread.id, "unheard");
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(rig.state.model().thread, undefined, "the thread is no longer followed");

  rig.state.back();
  assert.deepEqual(rig.state.model().where, { screen: "agents" });
  assert.equal(rig.state.model().agent, undefined);
  await until(() => rig.agents.scout?.connections() === 0, "the connection to the agent to end");
  rig.state.back();
  assert.deepEqual(rig.state.model().where, { screen: "agents" });
});

test("switching from one agent and thread to another stops no work", { timeout }, async (t) => {
  const rig = await startRig(t, { agents: ["scout", "mechanic"] });
  const first = await rig.thread("scout", "go");
  const second = await rig.thread("mechanic", "also go");
  const scoutSession = rig.agents.scout?.agent.session(first.id, { view: workingView([userItem("go")]) });
  assert.ok(scoutSession);
  await rig.until((model) => agentEntries(model).length === 2, "both agents");

  rig.state.selectAgent("scout");
  rig.state.openThread(first.id);
  await rig.until((model) => model.session?.status.busy === true, "scout's work");
  rig.state.back();
  rig.state.back();
  rig.state.selectAgent("mechanic");
  rig.state.openThread(second.id);
  await rig.until((model) => textsOf(model).join() === "also go", "mechanic's thread");

  assert.equal(scoutSession.stops, 0);
  assert.equal(scoutSession.view.status.busy, true, "and the work goes on");
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
  await working.chat.setWorking(busy.id, true);

  assert.deepEqual(await rig.state.farewell(), { agent: "scout", thread: busy.id });
  await working.chat.setWorking(other.id, true);
  await rig.until((model) => model.thread?.thread.working.length === 1, "the open thread to show the work");
  assert.deepEqual(await rig.state.farewell(), { agent: "scout", thread: other.id }, "the thread on screen first");
});

test("leaving does not call an agent busy that went away while its session showed work", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "go");
  rig.agents.scout?.agent.session(thread.id, { view: workingView([userItem("go")]) });
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.session?.status.busy === true, "the work to show");
  assert.deepEqual(await rig.state.farewell(), { agent: "scout", thread: thread.id });

  await rig.agents.scout?.outage();
  await rig.until((model) => model.agent?.state === "down", "the loss to be noticed");

  assert.equal(await rig.state.farewell(), undefined);
});

test("with no gateway running it says so, and picks everything up once the gateway and the chat server are there", { timeout }, async (t) => {
  const rig = await startRig(t, { noGateway: true });

  const model = await rig.until((each) => each.gateway.state === "down" && each.gateway.why.kind === "not-running", "the gateway to be missing");

  assert.deepEqual(model.gateway, { state: "down", why: { kind: "not-running" } });
  assert.deepEqual(model.where, { screen: "agents" });
  assert.deepEqual(agentEntries(model), []);
  await startStandInGateway(t);
  await rig.until((each) => each.gateway.state === "up", "the gateway");
  await rig.until((each) => each.chat.state === "up", "the chat server to register and be reached");
  await rig.until((each) => each.where.screen === "threads", "the agent to be listed and gone to");
});

test("with no chat server it says so", { timeout }, async (t) => {
  const rig = await startRig(t, { noChat: true });

  const model = await rig.until(
    (each) => each.chat.state === "down" && each.chat.why.kind === "not-registered" && agentEntries(each).length === 1,
    "chat to be missing",
  );

  assert.deepEqual(model.chat, { state: "down", why: { kind: "not-registered" } });
});

test("an agent is listed with the version of Shrimpy it runs", { timeout }, async (t) => {
  const rig = await startRig(t, { agents: ["scout", "mechanic"], agentVersion: "9.9.9" });

  const model = await rig.until((each) => agentEntries(each).length === 2, "both agents");

  assert.deepEqual(agentEntries(model).map((entry) => [entry.name, entry.version]), [["mechanic", "9.9.9"], ["scout", "9.9.9"]]);
});

test("closing lets go of every connection", { timeout }, async (t) => {
  const rig = await startRig(t);
  const thread = await rig.thread("scout", "go");
  rig.agents.scout?.agent.session(thread.id);
  await rig.until((model) => model.where.screen === "threads", "the threads");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.session !== undefined, "the session");

  // The rig itself holds a connection to chat, to make threads with.
  const others = rig.chat.connections() - 1;
  assert.equal(rig.agents.scout?.connections(), 1);
  await rig.state.close();

  await until(() => rig.chat.connections() === others && rig.agents.scout?.connections() === 0, "every connection to end");
});
