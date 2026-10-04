import assert from "node:assert/strict";
import { test } from "node:test";
import { DisconnectedError } from "@earendil-works/pi-client";
import { until } from "../../../lib/testing/index.ts";
import { scout } from "../../testing/index.ts";
import { startToolRig } from "./testing/index.ts";

const timeout = 15_000;

/** What Scout has said in a thread, oldest first. */
const saidByScout = (messages: { author: { id: string }; text: string }[]): string[] =>
  messages.filter((message) => message.author.id === scout.id).map((message) => message.text);

test("a call that runs again posts nothing twice, and a different call posts again, even under the same ID", { timeout }, async (t) => {
  const rig = await startToolRig(t, { messageLimit: 20 });
  const text = "first line here\nsecond line here";

  await rig.call("send_message", { text }, { taskId: 7, callId: "call-0" });
  const again = await rig.call("send_message", { text }, { taskId: 7, callId: "call-0" });

  assert.equal(again.isError, false);
  assert.equal(saidByScout(await rig.said()).length, 2, "two parts, once");

  // The model's call IDs repeat from one turn to the next, but each call is a task of its own.
  await rig.call("send_message", { text }, { taskId: 8, callId: "call-0" });
  assert.equal(saidByScout(await rig.said()).length, 4);
});

test("a call ID with characters chat does not take, or a very long one, still names a post chat takes", { timeout }, async (t) => {
  const rig = await startToolRig(t);

  const odd = await rig.call("send_message", { text: "One." }, { callId: "call with spaces\nand lines/and:slashes" });
  const long = await rig.call("send_message", { text: "Two." }, { callId: "x".repeat(500), taskId: 2 });

  assert.equal(odd.isError, false, odd.text);
  assert.equal(long.isError, false, long.text);
  assert.deepEqual(saidByScout(await rig.said()), ["One.", "Two."]);
});

test("a connection that dropped while the post was out is uncertain: the message may have arrived", { timeout }, async (t) => {
  let out = false;
  const rig = await startToolRig(t, {
    through: (chat) => ({
      ...chat,
      // The post goes out and nothing comes back until the connection is lost, as a call is then ended.
      post: (_threadId, _part, _requestId, signal) =>
        new Promise<never>((_resolve, reject) => {
          out = true;
          signal?.addEventListener("abort", () => reject(new DisconnectedError("Client is disconnected")), { once: true });
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
  assert.equal(saidByScout(await rig.said()).length, 1);
});

test("a call that is stopped while it waits for chat is stopped, not reported as chat being unreachable", { timeout }, async (t) => {
  let out = false;
  const rig = await startToolRig(t, {
    through: (chat) => ({
      ...chat,
      post: (_threadId, _part, _requestId, signal) =>
        new Promise<never>((_resolve, reject) => {
          out = true;
          signal?.addEventListener("abort", () => reject(signal.reason as Error), { once: true });
        }),
    }),
  });
  const stop = new AbortController();

  const calling = rig.call("send_message", { text: "Hello?" }, { signal: stop.signal });
  await until(() => out, "the post to be out");
  stop.abort(new DisconnectedError("The turn was stopped"));

  await assert.rejects(calling);
});
