import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Message } from "../../contracts/chat/index.ts";
import { eventually, until } from "../../lib/testing/index.ts";
import { type IntakeRig, startIntakeRig } from "./testing/index.ts";

const timeout = 15_000;

async function sayAndWait(rig: IntakeRig, text: string): Promise<Message> {
  const said = rig.say(text);
  await until(() => rig.turns.handed.has(said.id), `"${text}" to be handed over`);
  return said;
}

const workers = (rig: IntakeRig): string[] => rig.chat.working(rig.thread.id).map((mark) => mark.memberId);

test("the agent is working in a thread from the moment it picks a message up until its receipt is left", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  assert.deepEqual(workers(rig), []);

  const said = await sayAndWait(rig, "hello");
  await eventually(() => workers(rig), (found) => found.length === 1, { what: "the thread to be marked" });
  assert.deepEqual(workers(rig), ["agent:scout"]);
  rig.turns.end({ kind: "answered", answer: "1", text: "Hi." }, said.id);

  await eventually(() => workers(rig), (found) => found.length === 0, { what: "the mark to be cleared" });
  assert.equal(rig.turns.settled.length, 1, "and it was cleared once the message was settled");
});

test("the mark stays while any message in the thread is still being worked on", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const one = await sayAndWait(rig, "one");
  const two = await sayAndWait(rig, "two");

  rig.turns.end({ kind: "stopped" }, one.id);
  await until(() => rig.turns.settled.length === 1, "the first message to be settled");
  await delay(30);
  assert.deepEqual(workers(rig), ["agent:scout"]);
  rig.turns.end({ kind: "skipped" }, two.id);

  await eventually(() => workers(rig), (found) => found.length === 0, { what: "the mark to be cleared" });
});

test("every way a turn can end clears the mark", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const outcomes = [
    { kind: "answered", answer: "1", text: "Hi." },
    { kind: "answered", answer: "2", text: "END" },
    { kind: "stopped" },
    { kind: "skipped" },
    { kind: "failed", reason: "no good" },
  ] as const;

  for (const outcome of outcomes) {
    const said = await sayAndWait(rig, `for ${outcome.kind}`);
    await eventually(() => workers(rig), (found) => found.length === 1, { what: "the thread to be marked" });
    rig.turns.end(outcome, said.id);
    await eventually(() => workers(rig), (found) => found.length === 0, { what: `the mark to be cleared by ${outcome.kind}` });
  }
});

test("a mark made on a connection that was lost is made again on the next one", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  await eventually(() => workers(rig), (found) => found.length === 1, { what: "the thread to be marked" });

  rig.chat.down();
  assert.deepEqual(workers(rig), [], "chat forgot the mark with the connection");
  rig.chat.up();

  await eventually(() => workers(rig), (found) => found.length === 1, { what: "the thread to be marked again" });
  rig.turns.end({ kind: "stopped" }, said.id);
  await eventually(() => workers(rig), (found) => found.length === 0, { what: "the mark to be cleared" });
});

test("work that finished while chat was away is not marked when chat is back", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  rig.chat.down();

  rig.turns.end({ kind: "stopped" }, said.id);
  rig.chat.up();

  await until(() => rig.turns.settled.length === 1, "the message to be settled once chat is back");
  await eventually(() => workers(rig), (found) => found.length === 0, { what: "the mark to be cleared" });
  assert.deepEqual(rig.errors, []);
});

test("a mark chat refuses is reported, and nothing else suffers", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  rig.chat.fail("setWorking", new Error("not today"), 1);

  const said = await sayAndWait(rig, "hello");
  await until(() => rig.errors.length === 1, "the refusal to be reported");
  rig.turns.end({ kind: "answered", answer: "1", text: "Hi." }, said.id);

  await until(() => rig.turns.settled.length === 1, "the message to be settled");
  assert.equal(rig.errors[0]?.message, "not today");
});

test("the mark ends with the agent's connection, so an agent that dies never looks busy", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  await sayAndWait(rig, "hello");
  await eventually(() => workers(rig), (found) => found.length === 1, { what: "the thread to be marked" });

  await rig.intake.close();
  await rig.link.close();

  assert.deepEqual(workers(rig), []);
});
