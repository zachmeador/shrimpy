import assert from "node:assert/strict";
import { test } from "node:test";
import { ChordError } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { until } from "../../lib/testing/index.ts";

import { startToolRig } from "./testing/index.ts";
import { onChannel, onChat, onThread, valueOf } from "../../contracts/chat/testing/index.ts";

const timeout = 15_000;

/** What Scout has said in a thread, oldest first. */
const saidByScout = (rig: { partner: { id: string } }, messages: { author: { id: string }; text: string }[]): string[] =>
  messages.filter((message) => message.author.id === rig.partner.id).map((message) => message.text);

test("a call that runs again posts nothing twice", { timeout }, async (t) => {
  const rig = await startToolRig(t, { messageLimit: 20 });
  const text = "first line here\nsecond line here";

  await rig.call("send_message", { text }, { taskId: 7, callId: "call-0" });
  const again = await rig.call("send_message", { text }, { taskId: 7, callId: "call-0" });

  assert.equal(again.isError, false);
  assert.equal(saidByScout(rig, await rig.said()).length, 2, "two parts, once");
});

test("a call ID with characters chat does not take, or a very long one, still names a post chat takes", { timeout }, async (t) => {
  const rig = await startToolRig(t);

  const odd = await rig.call("send_message", { text: "One." }, { callId: "call with spaces\nand lines/and:slashes" });
  const long = await rig.call("send_message", { text: "Two." }, { callId: "x".repeat(500), taskId: 2 });

  assert.equal(odd.isError, false, odd.text);
  assert.equal(long.isError, false, long.text);
  assert.deepEqual(saidByScout(rig, await rig.said()), ["One.", "Two."]);
});

test("a link that dropped while the post was out is uncertain: the message may have arrived", { timeout }, async (t) => {
  let out = false;
  const rig = await startToolRig(t, {
    through: (chat) => ({
      ...chat,
      // The post goes out and nothing comes back until chat is lost, as a call is then ended.
      post: (_threadId, _part, _requestId, signal) =>
        new Promise<never>((_resolve, reject) => {
          out = true;
          signal.addEventListener("abort", () => reject(new ChordError({ code: "unavailable", message: "The link closed." })), { once: true });
        }),
    }),
  });

  const calling = rig.call("send_message", { text: "Did this arrive?" });
  await until(() => out, "the post to be out");
  rig.lose();
  const run = await calling;

  assert.equal(run.isError, true);
  assert.match(run.text, /may or may not have been posted/);
});

test("a text posted in parts says how far it got when chat goes away part of the way", { timeout }, async (t) => {
  const rig = await startToolRig(t, {
    messageLimit: 20,
    through: (chat, lose) => ({
      ...chat,
      post: async (threadId, part, requestId, signal) => {
        const posted = await chat.post(threadId, part, requestId, signal);
        lose();
        return posted;
      },
    }),
  });

  const run = await rig.call("send_message", { text: "first line here\nsecond line here\nthird line here" });

  assert.equal(run.isError, true);
  assert.match(run.text, /after 1 of 3 parts were posted/);
  assert.equal(saidByScout(rig, await rig.said()).length, 1);
});

test("a session behind a DM posts in a room it is in, in its main thread or another, and is refused a room it is not in", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  const person = await rig.chat.person();
  const context = BACKGROUND_CONTEXT;
  const ops = await onChat(person, async (held) => valueOf(await held.createRoom({ name: "Ops", members: [rig.partner.id] }, context)));
  const closed = await onChat(person, async (held) => valueOf(await held.createRoom({ name: "Closed", members: [] }, context)));
  const poem = await onChannel(person, ops.id, async (held) => valueOf(await held.createThread({ name: "Poem" }, context)));
  const mainOf = async (channelId: string): Promise<string> => {
    const main = await onChannel(person, channelId, (held) => held.threads.value.find((thread) => thread.main));
    assert.ok(main);
    return main.id;
  };
  const said = async (threadId: string): Promise<string[]> =>
    saidByScout(rig, await onThread(person, threadId, async (held) => valueOf(await held.read({ before: null, limit: 10 }, context))));

  const toRoom = await rig.call("send_message", { text: "To the room.", to: "#OPS" }, { callId: "room" });
  const toThread = await rig.call("send_message", { text: "To the thread.", to: "#ops/POEM" }, { callId: "thread" });
  const refused = await rig.call("send_message", { text: "Let me in.", to: "#Closed" }, { callId: "closed" });
  const read = await rig.call("read_messages", { from: `#Ops/${poem.id}` });

  assert.deepEqual([toRoom.isError, toThread.isError, refused.isError], [false, false, true]);
  assert.deepEqual(await said(await mainOf(ops.id)), ["To the room."]);
  assert.deepEqual(await said(poem.id), ["To the thread."]);
  assert.deepEqual(await said(await mainOf(closed.id)), [], "and nothing went to the room it is not in");
  assert.match(refused.text, /not in a room called #Closed\. The rooms you are in: #Ops\./);
  assert.ok(read.text.includes("To the thread."), "the thread can be read the same way");
  assert.deepEqual(saidByScout(rig, await rig.said()), [], "none of it went to the DM the session is behind");
});

test("a call that is stopped while it waits for chat is stopped, not reported as chat being unreachable", { timeout }, async (t) => {
  let out = false;
  const rig = await startToolRig(t, {
    through: (chat) => ({
      ...chat,
      post: (_threadId, _part, _requestId, signal) =>
        new Promise<never>((_resolve, reject) => {
          out = true;
          signal.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
        }),
    }),
  });
  const stop = new AbortController();

  const calling = rig.call("send_message", { text: "Hello?" }, { signal: stop.signal });
  await until(() => out, "the post to be out");
  stop.abort(new Error("The turn was stopped"));

  await assert.rejects(calling);
});
