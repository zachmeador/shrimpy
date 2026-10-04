import assert from "node:assert/strict";
import { test } from "node:test";
import { DisconnectedError } from "@earendil-works/pi-client";
import { agentMember, type ChatClient } from "../../../contracts/chat/index.ts";
import type { ScriptedChat } from "../../../contracts/chat/testing/index.ts";
import { Refusal } from "../../../lib/refusal/index.ts";
import { until } from "../../../lib/testing/index.ts";
import { scout, zach } from "../../testing/index.ts";
import { startToolRig } from "./testing/index.ts";

const timeout = 15_000;

/** What Scout has said in a thread, oldest first. */
const saidByScout = (messages: { author: { id: string }; text: string }[]): string[] =>
  messages.filter((message) => message.author.id === scout.id).map((message) => message.text);

test("with nothing said about where, a message is posted to the thread the session is behind", { timeout }, async (t) => {
  const rig = await startToolRig(t);

  const run = await rig.call("send_message", { text: "On it." });

  assert.deepEqual(run, {
    text: "Posted to this thread. Your reply at the end of your turn is posted too, so if this said it all, finish with END.",
    isError: false,
  });
  assert.deepEqual(saidByScout(rig.chat.messages(rig.thread.id)), ["On it."]);
  assert.deepEqual(
    rig.chat.messages(rig.thread.id).map((message) => message.addressed),
    [[zach.id]],
    "it is addressed to the other member of the DM, like any message the agent posts",
  );
});

test("@name posts to the main thread of the DM with that member, whatever case it is written in", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  const mechanic = agentMember("mechanic");
  const { thread: mechanicsThread } = rig.chat.dm(scout, mechanic);

  const toMechanic = await rig.call("send_message", { text: "The build is red.", to: "@mechanic" });
  const toZach = await rig.call("send_message", { text: "Heads up.", to: "@ZACH" }, { callId: "call-1" });
  const byId = await rig.call("send_message", { text: "By ID.", to: "@person:zach" }, { callId: "call-2" });

  assert.deepEqual(toMechanic, { text: "Posted to your DM with mechanic.", isError: false });
  assert.deepEqual(toZach, { text: "Posted to your DM with Zach.", isError: false });
  assert.equal(byId.text, "Posted to your DM with Zach.");
  assert.deepEqual(saidByScout(rig.chat.messages(mechanicsThread.id)), ["The build is red."]);
  assert.deepEqual(saidByScout(rig.chat.messages(rig.thread.id)), ["Heads up.", "By ID."]);
});

test("@name reaches a DM's main thread even from a side thread", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  const person = await rig.chat.join(zach);
  const side = await person.chat.createThread(rig.thread.channelId, "a side topic");

  await rig.call("send_message", { text: "To the main thread.", to: "@zach" });

  assert.deepEqual(saidByScout(rig.chat.messages(rig.thread.id)), ["To the main thread."]);
  assert.deepEqual(rig.chat.messages(side.id), []);
});

test("a text too long for one message is posted in parts, in order, and says so", { timeout }, async (t) => {
  const rig = await startToolRig(t, { messageLimit: 20 });

  const run = await rig.call("send_message", { text: "first line here\nsecond line here\nthird line here" });

  assert.equal(
    run.text,
    "Posted to this thread in 3 parts. Your reply at the end of your turn is posted too, so if this said it all, finish with END.",
  );
  assert.deepEqual(saidByScout(rig.chat.messages(rig.thread.id)), ["first line here\n", "second line here\n", "third line here"]);
});

test("a call that runs again posts nothing twice, and a different call posts again, even under the same ID", { timeout }, async (t) => {
  const rig = await startToolRig(t, { messageLimit: 20 });
  const text = "first line here\nsecond line here";

  await rig.call("send_message", { text }, { taskId: 7, callId: "call-0" });
  const again = await rig.call("send_message", { text }, { taskId: 7, callId: "call-0" });

  assert.equal(again.isError, false);
  assert.equal(saidByScout(rig.chat.messages(rig.thread.id)).length, 2, "two parts, once");

  // The model's call IDs repeat from one turn to the next, but each call is a task of its own.
  await rig.call("send_message", { text }, { taskId: 8, callId: "call-0" });
  assert.equal(saidByScout(rig.chat.messages(rig.thread.id)).length, 4);
});

test("a call ID with characters chat does not take, or a very long one, still names a post chat takes", { timeout }, async (t) => {
  const rig = await startToolRig(t);

  const odd = await rig.call("send_message", { text: "One." }, { callId: "call with spaces\nand lines/and:slashes" });
  const long = await rig.call("send_message", { text: "Two." }, { callId: "x".repeat(500), taskId: 2 });

  assert.equal(odd.isError, false, odd.text);
  assert.equal(long.isError, false, long.text);
  assert.deepEqual(saidByScout(rig.chat.messages(rig.thread.id)), ["One.", "Two."]);
});

test("with no text there is nothing to post", { timeout }, async (t) => {
  const rig = await startToolRig(t);

  const run = await rig.call("send_message", { text: " \n " });

  assert.deepEqual(run, { text: "Not sent: there is no text to post.", isError: true });
  assert.equal(rig.chat.messages().length, 0);
});

test("when chat is unreachable the message is not sent, and the model is told to try later, without waiting", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  rig.reachable(false);

  const run = await rig.call("send_message", { text: "Hello?" });

  assert.deepEqual(run, {
    text: "Not sent: chat is unreachable right now, so nothing was posted. Try again later.",
    isError: true,
  });
  assert.equal(rig.chat.calls("post"), 0);
});

test("a connection that was lost before the post went out means nothing was sent", { timeout }, async (t) => {
  const rig = await startToolRig(t, {
    through: (chat, scripted) => ({
      ...chat,
      // Chat goes away while the tool is working out where the DM is.
      channels: async (signal) => {
        const channels = await chat.channels(signal);
        scripted.down();
        return channels;
      },
    }),
  });

  const run = await rig.call("send_message", { text: "Hello?", to: "@zach" });

  assert.deepEqual(run, {
    text: "Not sent: chat is unreachable right now, so nothing was posted. Try again later.",
    isError: true,
  });
  assert.equal(rig.chat.calls("post"), 0);
});

test("a connection that dropped while the post was out is uncertain: the message may have arrived", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  const held = rig.chat.hold("post");

  const calling = rig.call("send_message", { text: "Did this arrive?" });
  await until(() => held.arrived() === 1, "the post to be out");
  rig.chat.down();
  const run = await calling;

  assert.deepEqual(run, {
    text:
      "Chat dropped the connection before it confirmed the message, so it may or may not have been posted. " +
      "Read the thread to check before you send it again.",
    isError: true,
  });
});

test("chat that refuses the message says why, and nothing is sent", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  rig.chat.fail("post", new Refusal("Unknown thread: th_gone"));

  const run = await rig.call("send_message", { text: "Hello?" });

  assert.deepEqual(run, { text: "Not sent: chat did not accept it (Unknown thread: th_gone).", isError: true });
});

test("a text posted in parts says how far it got when chat refuses or goes away part of the way", { timeout }, async (t) => {
  const text = "first line here\nsecond line here\nthird line here";
  /** Chat as the tools reach it, where `act` happens just as the second part is about to be posted. */
  const second = (act: (scripted: ScriptedChat) => void) => {
    let posts = 0;
    return (chat: ChatClient, scripted: ScriptedChat): ChatClient => ({
      ...chat,
      post: async (threadId, part, requestId, signal) => {
        posts += 1;
        if (posts === 2) act(scripted);
        return chat.post(threadId, part, requestId, signal);
      },
    });
  };

  const refused = await startToolRig(t, {
    messageLimit: 20,
    through: second(() => {
      throw new Refusal("Slow down.");
    }),
  });
  assert.equal(
    (await refused.call("send_message", { text })).text,
    "Chat did not accept part 2 of 3 (Slow down.) after 1 were posted. The rest was not sent.",
  );

  const dropped = await startToolRig(t, { messageLimit: 20, through: second((scripted) => scripted.down()) });
  assert.equal(
    (await dropped.call("send_message", { text })).text,
    "Chat dropped the connection after 1 of 3 parts were confirmed, and the next may or may not have been posted. " +
      "Read the thread to check before you send the rest.",
  );

  const cutOff = await startToolRig(t, {
    messageLimit: 20,
    through: (chat, scripted) => ({
      ...chat,
      post: async (threadId, part, requestId, signal) => {
        const posted = await chat.post(threadId, part, requestId, signal);
        scripted.down();
        return posted;
      },
    }),
  });
  assert.equal(
    (await cutOff.call("send_message", { text })).text,
    "Chat became unreachable after 1 of 3 parts were posted. The rest was not sent. Try again later, and send only the rest.",
  );
  assert.equal(saidByScout(cutOff.chat.messages(cutOff.thread.id)).length, 1);
});

test("a place that can't be used is said in words the model can act on, and nothing is sent", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  rig.chat.dm(scout, { id: "agent:zach", kind: "agent", name: "Zach" });

  const texts = {
    noAt: (await rig.call("send_message", { text: "x", to: "zach" })).text,
    nobody: (await rig.call("send_message", { text: "x", to: "@nobody" })).text,
    yourself: (await rig.call("send_message", { text: "x", to: "@scout" })).text,
    several: (await rig.call("send_message", { text: "x", to: "@zach" })).text,
    channel: (await rig.call("send_message", { text: "x", to: "#general" })).text,
  };

  assert.deepEqual(texts, {
    noAt: "to should be @name, such as @zach: the name of someone you have a DM with. Leave it out to post to this thread.",
    nobody:
      "You have no DM with @nobody, so there is nowhere to send this. A DM exists once one of you has written to the other.",
    yourself: "@scout is you. Leave to out to post to this thread.",
    several: "@zach matches more than one member: person:zach, agent:zach. Use the full ID, such as @person:zach.",
    channel: "to should be @name, such as @zach: the name of someone you have a DM with. Leave it out to post to this thread.",
  });
  assert.equal(rig.chat.messages().length, 0);
});

test("a session that is behind no thread has nowhere to post by default, and is told to say where", { timeout }, async (t) => {
  const rig = await startToolRig(t, { inThread: false });

  const nowhere = await rig.call("send_message", { text: "x" });
  const somewhere = await rig.call("send_message", { text: "x", to: "@zach" });

  assert.deepEqual(nowhere, {
    text: "This session is not in a thread, so there is no thread to post to by default. Say which with to: @name.",
    isError: true,
  });
  assert.equal(somewhere.isError, false);
});

test("a call that is stopped while it waits for chat is stopped, not reported as chat being unreachable", { timeout }, async (t) => {
  const rig = await startToolRig(t);
  rig.chat.hold("post");
  const stop = new AbortController();

  const calling = rig.call("send_message", { text: "Hello?" }, { signal: stop.signal });
  await until(() => rig.chat.calls("post") === 1, "the post to be out");
  stop.abort(new DisconnectedError("The turn was stopped"));

  await assert.rejects(calling);
});
