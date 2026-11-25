import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { ChordError, type Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Chat } from "../../contracts/chat/index.ts";
import { type Answer, Roster } from "../../contracts/gateway/index.ts";
import { startTestPushService } from "../../contracts/gateway/testing/index.ts";
import { until } from "../../lib/testing/index.ts";

import { startToolRig } from "./testing/index.ts";
import { onChannel, onChat, valueOf } from "../../contracts/chat/testing/index.ts";

const timeout = 15_000;

/** What Scout has said in a thread, oldest first. */
const saidByScout = (rig: { partner: { id: string } }, messages: { author: { id: string }; text: string }[]): string[] =>
  messages.filter((message) => message.author.id === rig.partner.id).map((message) => message.text);

test("a call that runs again posts nothing twice, and one to @name posts in the thread its first run started", { timeout }, async (t) => {
  const rig = await startToolRig(t, { messageLimit: 20 });
  const text = "first line here\nsecond line here";

  await rig.call("send_message", { text }, { taskId: 7, callId: "call-0" });
  const again = await rig.call("send_message", { text }, { taskId: 7, callId: "call-0" });

  assert.equal(again.isError, false);
  assert.equal(saidByScout(rig, await rig.said()).length, 2, "two parts, once");

  const to = `@${rig.me.name}`;
  await rig.call("send_message", { text, to }, { taskId: 8, callId: "call-0" });
  const rerun = await rig.call("send_message", { text, to }, { taskId: 8, callId: "call-0" });

  assert.equal(rerun.isError, false, rerun.text);
  const started = new Set((await rig.events()).filter((event) => event.kind === "posted" && event.message.threadId !== rig.thread.id).map((event) => event.message.threadId));
  assert.equal(started.size, 1, "one thread");
  const [thread] = started;
  assert.ok(thread !== undefined && rerun.text.includes(thread));
  assert.equal(saidByScout(rig, await rig.said(thread)).length, 2, "two parts, once");
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

test("#room posts in the room's first pinned thread, #room/thread in any, and a room with no pin or that the agent isn't in is refused", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  const person = await rig.chat.person();
  const context = BACKGROUND_CONTEXT;
  const asking = <T>(ask: (chat: Reference<typeof Chat>) => Promise<Answer<T>>): Promise<T> => onChat(person, async (held) => valueOf(await ask(held)));
  const ops = await asking((chat) => chat.createRoom({ name: "Ops", members: [rig.partner.id] }, context));
  await asking((chat) => chat.createRoom({ name: "Closed", members: [] }, context));
  const [first] = await onChannel(person, ops.id, (held) => held.threads.value);
  assert.ok(first);
  const poem = await asking((chat) => chat.createThread({ channel: ops.id, name: "Poem" }, context));
  const pinnedPoem = await asking((chat) => chat.pin({ thread: poem.id, pinned: true, revision: poem.revision }, context));
  const said = async (threadId: string): Promise<string[]> =>
    saidByScout(rig, await asking((chat) => chat.read({ thread: threadId, before: null, limit: 10 }, context)));

  const toRoom = await rig.call("send_message", { text: "To the room.", to: "#OPS" }, { callId: "room" });
  const toThread = await rig.call("send_message", { text: "To the thread.", to: "#ops/POEM" }, { callId: "thread" });
  const closed = await rig.call("send_message", { text: "Let me in.", to: "#Closed" }, { callId: "closed" });
  const read = await rig.call("read_messages", { from: `#Ops/${poem.id}` });
  await asking((chat) => chat.pin({ thread: first.id, pinned: false, revision: first.revision }, context));
  const toNextPin = await rig.call("send_message", { text: "To the next pin.", to: "#ops" }, { callId: "next" });
  await asking((chat) => chat.pin({ thread: poem.id, pinned: false, revision: pinnedPoem.revision }, context));
  const unpinned = await rig.call("send_message", { text: "To nowhere.", to: "#ops" }, { callId: "none" });

  assert.deepEqual([toRoom, toThread, closed, toNextPin, unpinned].map((call) => call.isError), [false, false, true, false, true]);
  assert.deepEqual(await said(first.id), ["To the room."], "the oldest pin");
  assert.deepEqual(await said(poem.id), ["To the thread.", "To the next pin."]);
  assert.match(closed.text, /not in a room called #Closed\. The rooms you are in: #Ops\./);
  assert.ok(unpinned.text.includes(first.id) && unpinned.text.includes(poem.id), "a room with no pin is refused with its threads");
  assert.ok(read.text.includes("To the thread."), "the thread can be read the same way");
  assert.deepEqual(saidByScout(rig, await rig.said()), [], "none of it went to the DM the session is behind");
});

test("@name starts a thread and names it, and @name/thread posts in any of the DM's threads", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  const me = `@${rig.me.name}`;
  await rig.postAsScout("Posted in the thread you started.");

  const first = await rig.call("send_message", { text: "Build report\nAll green.", to: me }, { callId: "first" });
  const second = await rig.call("send_message", { text: "Disk report\nThe NAS is at 81%.", to: me }, { callId: "second" });
  const threadOf = async (text: string): Promise<string> => {
    const found = (await rig.events()).find((event) => event.kind === "posted" && event.text === text);
    assert.ok(found, text);
    return found.message.threadId;
  };
  const [build, disk] = [await threadOf("Build report\nAll green."), await threadOf("Disk report\nThe NAS is at 81%.")];
  assert.equal(new Set([build, disk, rig.thread.id]).size, 3, "each starts a thread of its own");
  assert.ok(first.text.includes(build) && second.text.includes(disk), "and its result names it");

  const again = await rig.call("send_message", { text: "Still green.", to: `${me}/${build}` }, { callId: "again" });
  const old = await rig.call("send_message", { text: "And here.", to: `${me}/${rig.thread.id}` }, { callId: "old" });
  assert.deepEqual([again.isError, old.isError], [false, false]);
  assert.deepEqual(saidByScout(rig, await rig.said(build)), ["Build report\nAll green.", "Still green."]);
  assert.deepEqual(saidByScout(rig, await rig.said()), ["Posted in the thread you started.", "And here."]);

  const which = await rig.call("read_messages", { from: me });
  assert.equal(which.isError, true, "there is no one thread to read");
  for (const named of [build, disk, rig.thread.id, "Build report", "Disk report", "Posted in"]) assert.ok(which.text.includes(named), named);
  const read = await rig.call("read_messages", { from: `${me}/${disk}` });
  assert.ok(read.text.includes("The NAS is at 81%."), read.text);
});

test("a message sent quietly is told to none of the person's devices, and one sent plainly is", { timeout: 30_000 }, async (t) => {
  const rig = await startToolRig(t);
  const person = await rig.chat.person();
  const roster = await person.host.get(Roster, {}, BACKGROUND_CONTEXT);
  const page = rig.chat.gateway.listening.page;
  assert.ok(page !== null, "the gateway serves the page");
  const push = await startTestPushService(t);
  const phone = await push.subscribe(page, valueOf(await roster.inviteDevice(BACKGROUND_CONTEXT)).code, "phone");

  const quiet = await rig.call("send_message", { text: "Still reading the logs.", quiet: true }, { callId: "quiet" });
  const plain = await rig.call("send_message", { text: "The disk is full." }, { callId: "plain" });

  assert.deepEqual([quiet.isError, plain.isError], [false, false]);
  assert.deepEqual(saidByScout(rig, await rig.said()), ["Still reading the logs.", "The disk is full."], "both are posted");
  const [told] = await phone.untilNotified(1);
  assert.equal(told?.line, "The disk is full.", "the quiet one, sent first, is told to nobody");
  await delay(1_000);
  assert.equal(phone.notifications().length, 1);
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
