import assert from "node:assert/strict";
import { test } from "node:test";
import { isNotListening } from "../../../lib/connection/index.ts";
import { eventually, settle, until, useRuntimeDir } from "../../../lib/testing/index.ts";
import { agentMember, personMember } from "../index.ts";
import { scriptedChat, startStandInChat } from "./index.ts";

const timeout = 15_000;

const zach = personMember("zach");
const scout = agentMember("scout");

/** The stand-in, with Zach and Scout connected to it over its socket and the main thread of their DM. */
async function startDm(t: Parameters<typeof startStandInChat>[0]) {
  useRuntimeDir(t);
  const stand = await startStandInChat(t);
  const person = await stand.join(zach);
  const agent = await stand.join(scout);
  const dm = await person.chat.openDm(scout);
  const [thread] = await person.chat.threads(dm.id);
  assert.ok(thread);
  return { stand, person, agent, dm, thread };
}

test("a message a person posts is offered to the agent in the DM, and the feed waits while there is none", { timeout }, async (t) => {
  const { person, agent, thread } = await startDm(t);

  const waiting = agent.chat.feed(0, 10);
  await settle();
  const posted = await person.chat.post(thread.id, "hello", "zach-1");

  const offered = await waiting;
  assert.deepEqual(
    offered.map((message) => [message.id, message.text, message.addressed]),
    [[posted.id, "hello", ["agent:scout"]]],
  );
  assert.equal(await agent.chat.head(), posted.seq);
});

test("a feed that is cancelled while it waits ends, and the chat keeps no watcher for it", { timeout }, async (t) => {
  const { agent } = await startDm(t);
  const cancel = new AbortController();

  const waiting = assert.rejects(agent.chat.feed(0, 10, cancel.signal));
  await settle();
  cancel.abort(new Error("enough"));

  await waiting;
});

test("posting again under a request ID gives back the first message, and a different message under it is refused", { timeout }, async (t) => {
  const { stand, person, thread } = await startDm(t);

  const first = await person.chat.post(thread.id, "hello", "zach-1");
  const again = await person.chat.post(thread.id, "hello", "zach-1");

  assert.deepEqual(again, first);
  assert.equal(stand.chat.messages().length, 1);
  await assert.rejects(person.chat.post(thread.id, "something else", "zach-1"), {
    code: "service_invalid_value",
    message: "Request zach-1 already posted a different message.",
  });
  await assert.rejects(person.chat.post(thread.id, "   ", "zach-2"), { message: "A message needs some text." });
});

test("a cursor past the newest message is refused with the reason the chat server gives", { timeout }, async (t) => {
  const { stand, person, agent, thread } = await startDm(t);
  await person.chat.post(thread.id, "hello", "zach-1");

  await assert.rejects(agent.chat.feed(5, 10), {
    code: "service_invalid_value",
    message: "The cursor 5 is past the newest message, 1. Start again from head.",
  });

  stand.chat.replace();
  await assert.rejects(agent.chat.feed(1, 10), /past the newest message, 0/);
  assert.equal(await agent.chat.head(), 0);
});

test("a receipt is checked as the chat server checks it, and a later one replaces an earlier one", { timeout }, async (t) => {
  const { person, agent, thread } = await startDm(t);
  const asked = await person.chat.post(thread.id, "hello", "zach-1");
  const reply = await agent.chat.post(thread.id, "hi", "reply-1");

  await agent.chat.leaveReceipt([asked.id], { status: "skipped", reply: null, detail: null });
  await agent.chat.leaveReceipt([asked.id], { status: "answered", reply: reply.id, detail: null });
  await agent.chat.leaveReceipt([asked.id], { status: "answered", reply: reply.id, detail: null });

  const [read] = await person.chat.read(thread.id, reply.seq, 10);
  assert.deepEqual(read?.receipts, [{ memberId: "agent:scout", status: "answered", reply: reply.id, detail: null }]);
  const refusals: [Promise<void>, RegExp][] = [
    [person.chat.leaveReceipt([asked.id], { status: "silent", reply: null, detail: null }), /^Only an agent/],
    [agent.chat.leaveReceipt([asked.id], { status: "answered", reply: null, detail: null }), /needs a reply/],
    [agent.chat.leaveReceipt([asked.id], { status: "failed", reply: null, detail: null }), /needs a detail/],
    [agent.chat.leaveReceipt([asked.id], { status: "silent", reply: reply.id, detail: null }), /Only an answered receipt/],
    [agent.chat.leaveReceipt([asked.id], { status: "answered", reply: asked.id, detail: null }), /not a message you wrote/],
    [agent.chat.leaveReceipt(["msg_nothing"], { status: "silent", reply: null, detail: null }), /^Unknown message: msg_nothing/],
    [agent.chat.leaveReceipt([], { status: "silent", reply: null, detail: null }), /list of 1 to 200 IDs/],
  ];
  for (const [call, reason] of refusals) await assert.rejects(call, { code: "service_invalid_value", message: reason });
});

test("a member is working in a thread until it says it is not, or its connection ends", { timeout }, async (t) => {
  const { stand, agent, thread } = await startDm(t);

  await agent.chat.setWorking(thread.id, true);
  assert.deepEqual(
    stand.chat.working(thread.id).map((mark) => mark.memberId),
    ["agent:scout"],
  );
  await agent.chat.setWorking(thread.id, false);
  assert.deepEqual(stand.chat.working(thread.id), []);

  await agent.chat.setWorking(thread.id, true);
  await agent.close();
  await until(() => stand.chat.working(thread.id).length === 0, "the mark to end with its connection");
});

test("an outage cuts the connections and keeps what was said, and the chat comes back as the same server", { timeout }, async (t) => {
  const { stand, person, agent, thread } = await startDm(t);
  await person.chat.post(thread.id, "before", "zach-1");
  const lost = new Promise<Error | undefined>((resolve) => agent.onDisconnect(resolve));

  await stand.outage();

  await lost;
  await until(() => stand.connections() === 0, "the connections to close");
  await assert.rejects(stand.join(scout), (error: unknown) => isNotListening(error));
  await stand.recover();
  const returned = await stand.join(scout);
  assert.deepEqual(
    (await returned.chat.feed(0, 10)).map((message) => message.text),
    ["before"],
  );
});

test("a chat in this process refuses connections while it is down, as a connection to nothing is refused", { timeout }, async () => {
  const chat = scriptedChat();
  const agent = await chat.join(scout);
  const lost = new Promise<Error | undefined>((resolve) => agent.onDisconnect(resolve));

  chat.down();

  assert.match((await lost)?.message ?? "", /went down/);
  await assert.rejects(agent.chat.head(), /disconnected/);
  await assert.rejects(chat.connect(), (error: unknown) => isNotListening(error));
  chat.up();
  assert.equal(await (await chat.join(scout)).chat.head(), 0);
});

test("a feed that is waiting when the connection is cut ends with the disconnection", { timeout }, async () => {
  const chat = scriptedChat();
  const agent = await chat.join(scout);
  const waiting = assert.rejects(agent.chat.feed(0, 10), /disconnected/);
  await settle();

  chat.down();

  await waiting;
});

test("a call can be made to fail, or to wait until the test lets it go", { timeout }, async () => {
  const chat = scriptedChat();
  const person = await chat.join(zach);
  await chat.join(scout);
  const { thread } = chat.dm(zach, scout);

  chat.fail("post", new Error("the disk is full"), 2);
  await assert.rejects(person.chat.post(thread.id, "one", "r-1"), /the disk is full/);
  await assert.rejects(person.chat.post(thread.id, "one", "r-1"), /the disk is full/);
  const held = chat.hold("post");
  const posting = person.chat.post(thread.id, "one", "r-1");
  await eventually(() => held.arrived(), (arrived) => arrived === 1, { what: "the call to arrive" });
  assert.deepEqual(chat.messages(), []);
  held.release();

  assert.equal((await posting).text, "one");
  assert.equal(chat.calls("post"), 3);
});

test("a person can be made to say something without a connection, while the chat is down too", { timeout }, () => {
  const chat = scriptedChat();
  const { thread } = chat.dm(zach, scout);

  chat.down();
  const said = chat.say(zach, thread.id, "said into the void");

  assert.deepEqual(said.addressed, ["agent:scout"]);
  assert.deepEqual(
    chat.messages(thread.id).map((message) => [message.id, message.text]),
    [[said.id, "said into the void"]],
  );
  assert.equal(chat.calls("post"), 0, "it was not a call, so a failure scripted for post does not touch it");
});
