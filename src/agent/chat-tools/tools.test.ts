import assert from "node:assert/strict";
import { test } from "node:test";
import { callingTools, roomWith, startAgentRig } from "../testing/index.ts";

const timeout = 30_000;

test("post and thread tools create, rename, list, read by bare thread ID, and archive threads", { timeout }, async (t) => {
  const model = callingTools(
    [
      [
        { name: "post", args: { text: "Mid-turn progress update." } },
        { name: "thread", args: { action: "create", name: "Daily research" } },
        { name: "thread", args: { action: "list" } },
      ],
    ],
    "Final reply.",
  );
  const rig = await startAgentRig(t, { script: model.script, tokensPerSecond: 1_000_000 });
  await rig.receiptOn(await rig.say("do thread ops"));

  assert.equal(model.answers.every((a) => !a.isError), true, JSON.stringify(model.answers));
  const createdMatch = /th_[0-9a-z]{12}/.exec(model.answers[1]?.text ?? "");
  assert.ok(createdMatch, `expected new thread ID in: ${model.answers[1]?.text}`);
  const createdId = createdMatch[0];
  assert.ok(model.answers[2]?.text.includes("Daily research"), model.answers[2]?.text ?? "");

  // Mid-turn post + final reply both landed in the current thread.
  const replies = await rig.replies();
  assert.deepEqual(
    replies.map((m) => m.text),
    ["Mid-turn progress update.", "Final reply."],
  );

  // Second turn: post to bare thread ID, read it back, rename it, and archive it.
  const second = callingTools(
    [
      [],
      [
        { name: "post", args: { to: createdId, text: "First note in dedicated thread." } },
        { name: "thread", args: { action: "read", thread: createdId } },
        { name: "thread", args: { action: "rename", thread: createdId, name: "Weekly research" } },
        { name: "thread", args: { action: "archive", thread: createdId } },
      ],
    ],
    "All done.",
  );
  await rig.agent.close({ now: true });
  const rig2 = await startAgentRig(t, { home: rig.home, chat: rig.chat, script: second.script, tokensPerSecond: 1_000_000 });
  await rig2.receiptOn(await rig2.say("now follow up", rig.thread.id));
  assert.equal(second.answers.every((a) => !a.isError), true, JSON.stringify(second.answers));
  assert.ok(second.answers[1]?.text.includes("First note in dedicated thread."), second.answers[1]?.text ?? "");
  assert.ok(second.answers[2]?.text.includes("Weekly research"), second.answers[2]?.text ?? "");
  assert.ok(second.answers[3]?.text.includes("Archived"), second.answers[3]?.text ?? "");
});

test("post to a room sets no watch and delivers to the room's pinned thread", { timeout }, async (t) => {
  const model = callingTools([[{ name: "post", args: { to: "#ops", text: "Deploy started." } }]], "Posted to #ops.");
  const rig = await startAgentRig(t, { script: model.script, tokensPerSecond: 1_000_000 });
  const ops = await roomWith(t, rig.chat, "ops", [rig.partner]);
  const connection = await rig.connect();

  await rig.receiptOn(await rig.say("announce in ops"));
  assert.equal(model.answers[0]?.isError, false, model.answers[0]?.text ?? "");
  assert.equal((await connection.watches()).length, 0, "posting to a room sets no watch");
  const inOps = await rig.said(ops.pinned.id);
  assert.ok(inOps.some((m) => m.text === "Deploy started."));
});
