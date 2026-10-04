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
