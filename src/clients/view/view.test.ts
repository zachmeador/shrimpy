import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lookFromId, parseSigil, PIGMENTS } from "../../contracts/agent/index.ts";
import type { Thread } from "../../contracts/chat/index.ts";
import type { Speaking } from "../../contracts/chat/testing/index.ts";
import { SHRIMPY_ENTRY } from "../../contracts/gateway/testing/index.ts";
import { runChild, startChild, tempDir } from "../../lib/testing/index.ts";
import type { Model } from "../state/index.ts";
import { startRig } from "../state/testing/index.ts";
import { agentsLevel, listLevel, type Look, type Row } from "./index.ts";

/*
 * The views of a client's state against the real gateway and chat server, in processes of their own, with small
 * agents' programs linked to the gateway that work in chat through their links, or a real agent's program, started
 * as `shrimpy agent serve` starts it, where what the agent shows of itself matters.
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

test("an agent's list says that the agent is an admin, and says nothing of it for one that is not", { timeout }, async (t) => {
  // The first agent a roster has is an admin, and the next isn't.
  const rig = await startRig(t, { agents: ["scout", "mechanic"] });
  const scout = await rig.member("scout");
  const mechanic = await rig.member("mechanic");
  rig.state.selectAgent(scout.id);
  await rig.until((model) => model.open.list?.id === scout.id && listLevel(model, at)?.tag !== undefined, "scout's list to say it is an admin");
  rig.state.selectAgent(mechanic.id);
  const ordinary = await rig.until((model) => model.open.list?.id === mechanic.id, "mechanic's list");
  assert.equal(listLevel(ordinary, at)?.tag, undefined);
});

test("an agent's look follows its home's files while it runs, and is worked out from its member ID while it does not", { timeout: 90_000 }, async (t) => {
  const rig = await startRig(t, { agents: [] });
  const home = join(tempDir(t, "crab-home"), "crab");
  // A Shrimpy folder of its own, so that a real one never reaches the agent.
  const env = { SHRIMPY_DIR: tempDir(t, "folder") };
  const made = await runChild({ file: SHRIMPY_ENTRY, args: ["agent", "init", home, "--name", "crab", "--model", "local/test-model"], env }).ended;
  assert.equal(made.code, 0, made.stderr);
  // The agent starts only with its model's provider declared. Nothing here asks the model anything.
  const model = { id: "test-model", reasoning: true, contextWindow: 262_144, maxTokens: 65_536 };
  const local = { baseUrl: "http://127.0.0.1:9/v1", api: "openai-completions", apiKey: "local", models: [model] };
  writeFileSync(join(home, "state", "pi", "models.json"), JSON.stringify({ providers: { local } }));
  const crab = await startChild(t, { file: SHRIMPY_ENTRY, args: ["agent", "serve", home], env });
  const looked = (model: Model): Look | undefined => agentsLevel(model, at).rows.find((row) => row.kind === "agent")?.look;
  const config = (): { pigment: string } => JSON.parse(readFileSync(join(home, "agent.json"), "utf8")) as { pigment: string };
  const sigil = parseSigil(readFileSync(join(home, "sigil"), "utf8"));
  assert.ok(sigil, "a new home has a sigil");
  const { pigment } = config();

  await rig.until((model) => looked(model)?.sigil.join() === sigil.join() && looked(model)?.pigment === pigment, "crab's look as its home has it");
  const frame = ["#".repeat(12), ...Array.from({ length: 10 }, () => `#${".".repeat(10)}#`), "#".repeat(12)];
  writeFileSync(join(home, "sigil"), `${frame.join("\n")}\n`);
  const other = PIGMENTS.find((each) => each !== pigment);
  writeFileSync(join(home, "agent.json"), `${JSON.stringify({ ...config(), pigment: other }, null, 2)}\n`);
  await rig.until((model) => looked(model)?.sigil.join() === frame.join() && looked(model)?.pigment === other, "crab's look as its home has it now");

  await crab.kill();
  const fromId = lookFromId((await rig.member("crab")).id);
  await rig.until((model) => looked(model)?.sigil.join() === fromId.sigil.join() && looked(model)?.pigment === fromId.pigment, "the look worked out from crab's member ID");
});
