import assert from "node:assert/strict";
import { test } from "node:test";
import type { Thread } from "../../contracts/chat/index.ts";
import type { Speaking } from "../../contracts/chat/testing/index.ts";
import type { Model } from "../state/index.ts";
import { startRig } from "../state/testing/index.ts";
import { agentsLevel, listLevel, type Row } from "./index.ts";

/*
 * The views of a client's state against the real gateway and chat server, in processes of their own, with small
 * agents' programs linked to the gateway that work in chat through their links.
 */

const timeout = 30_000;
const at = { now: Date.now(), self: "this test" };

/** The main thread of a channel, as the person reads it. */
async function mainOf(you: Speaking, channelId: string): Promise<Thread> {
  const found = (await you.threads(channelId)).find((each) => each.main);
  assert.ok(found, `${channelId} has a main thread`);
  return found;
}

/** How many messages are new on the row of `rows` that opens `kind` `id`. */
const countOn = (rows: Row[] | undefined, kind: Row["kind"], id: string): number | undefined =>
  rows?.find((row) => row.kind === kind && row.id === id)?.unread;

test("what is new to the person is counted on each thread, each agent and room, and in all", { timeout }, async (t) => {
  const rig = await startRig(t, { agents: ["scout", "mechanic"] });
  const scout = await rig.member("scout");
  const mechanic = await rig.member("mechanic");
  const you = await rig.person();
  const asScout = await rig.asAgent("scout");
  const asMechanic = await rig.asAgent("mechanic");
  // Each thread is started by the person, and what they write is never new to them.
  const disk = await rig.thread("scout", "check the disk");
  const logs = await rig.thread("scout", "and the logs");
  const backup = await rig.thread("mechanic", "the backup");
  await asScout.post(disk.id, "43% used");
  await asScout.post(disk.id, "the rest is photos");
  await asScout.post(logs.id, "quiet");
  await asMechanic.post(backup.id, "done");
  const home = await you.createRoom("home", [scout.id]);
  await asScout.post((await mainOf(you, home.id)).id, "dinner at 7");
  // A room the person only reads counts on its own row, and is left out of all.
  const lab = await asScout.createRoom("lab", [mechanic.id]);
  await asMechanic.post((await mainOf(you, lab.id)).id, "the bench is free");

  const counted = await rig.until((model) => countOn(agentsLevel(model, at).rows, "read-only", lab.id) === 1 && agentsLevel(model, at).unread === 5, "the counts");
  const { rows, unread } = agentsLevel(counted, at);
  assert.deepEqual(
    [countOn(rows, "agent", scout.id), countOn(rows, "agent", mechanic.id), countOn(rows, "room", home.id), countOn(rows, "read-only", lab.id)],
    [3, 1, 1, 1],
  );
  assert.equal(unread, 5);

  rig.state.selectAgent(scout.id);
  const threads = (model: Model): Row[] | undefined => listLevel(model, at)?.rows;
  const listed = await rig.until((model) => countOn(threads(model), "thread", logs.id) !== undefined, "scout's list");
  assert.deepEqual([countOn(threads(listed), "thread", disk.id), countOn(threads(listed), "thread", logs.id)], [2, 1]);
  rig.state.selectRoom(home.id);
  const room = await rig.until((model) => model.open.list?.id === home.id, "the room's list");
  assert.deepEqual(threads(room)?.map((row) => row.unread), [1]);
});
