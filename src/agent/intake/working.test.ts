import assert from "node:assert/strict";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import type { Message } from "../../contracts/chat/index.ts";
import { until } from "../../lib/testing/index.ts";
import { type IntakeRig, startIntakeRig } from "./testing/index.ts";

const timeout = 15_000;

async function sayAndWait(rig: IntakeRig, text: string): Promise<Message> {
  const said = await rig.say(text);
  await until(() => rig.turns.handed.has(said.id), `"${text}" to be handed over`);
  return said;
}

test("the mark stays while any message in the thread is still being worked on", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const one = await sayAndWait(rig, "one");
  const two = await sayAndWait(rig, "two");

  rig.turns.end({ kind: "stopped" }, one.id);
  await until(() => rig.turns.settled.length === 1, "the first message to be settled");
  await delay(30);
  assert.deepEqual(await rig.working(), ["agent:scout"]);
  rig.turns.end({ kind: "skipped" }, two.id);

  await rig.untilIdle();
});

test("a mark made on a connection that was lost is made again on the next one", { timeout }, async (t) => {
  const rig = await startIntakeRig(t);
  const said = await sayAndWait(rig, "hello");
  await rig.untilWorking();

  await rig.chat.outage();
  await rig.chat.recover();

  await rig.untilWorking();
  rig.turns.end({ kind: "stopped" }, said.id);
  await rig.untilIdle();
});
