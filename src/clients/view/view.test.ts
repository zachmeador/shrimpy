import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { Agent, lookFromId, parseSigil, PIGMENTS } from "../../contracts/agent/index.ts";
import { servingAnotherAgent } from "../../contracts/agent/testing/index.ts";
import { PINNED, type Thread, triggerLabel } from "../../contracts/chat/index.ts";
import type { Speaking } from "../../contracts/chat/testing/index.ts";
import { valueOf } from "../../contracts/gateway/index.ts";
import { linkTestAgent, SHRIMPY_ENTRY } from "../../contracts/gateway/testing/index.ts";
import { type Child, runChild, startChild, tempDir } from "../../lib/testing/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import { CONNECTING } from "../network/index.ts";
import type { Model } from "../state/index.ts";
import { aChatServer, aDm, agentMember, aListing, aModel, anAgent, aRoom, aSession, aThread, type Rig, startRig } from "../state/testing/index.ts";
import { agentsLevel, listLevel, type ListLevel, type Look, pageLevel, type Row, threadLevel, withMentions } from "./index.ts";
import { TURNED_AWAY } from "./words.ts";

/*
 * The views of a client's state against the real gateway and chat server, in processes of their own, with small
 * agents' programs linked to the gateway that work in chat through their links, or a real agent's program, started
 * as `shrimpy agent serve` starts it, where what the agent shows of itself matters.
 */

const timeout = 30_000;
const at = { now: Date.now(), self: "this test" };

/** The thread a room is made with, which is pinned, as the person reads it. */
async function pinnedOf(you: Speaking, channelId: string): Promise<Thread> {
  const [found] = await you.threads(channelId);
  assert.ok(found?.pinned !== null && found !== undefined, `${channelId} has a pinned thread`);
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
  await asScout.post((await pinnedOf(you, home.id)).id, "dinner at 7");
  // A room the person only reads counts on its own row, and is left out of all.
  const lab = await asScout.createRoom("lab", [mechanic.id]);
  await asMechanic.post((await pinnedOf(you, lab.id)).id, "the bench is free");

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

/** Which messages of the open thread are marked as the first that was new. */
const firstNew = (model: Model): boolean[] => threadLevel(model, at)?.messages.map((row) => row.firstNew) ?? [];

test("the first message that was new when the person looked at the thread stays marked once it is read, and nothing after it is", { timeout }, async (t) => {
  const rig = await startRig(t);
  const scout = await rig.member("scout");
  const asScout = await rig.asAgent("scout");
  const thread = await rig.thread("scout", "check the disk");
  await asScout.post(thread.id, "43% used");
  await asScout.post(thread.id, "the rest is photos");
  await rig.until((model) => model.open.list?.id === scout.id, "scout's list");

  rig.state.openThread(thread.id);
  rig.state.look(true);
  const read = await rig.until((model) => model.thread?.messages.length === 3 && model.thread.unread === 0, "the thread, read");
  assert.deepEqual(firstNew(read), [false, true, false]);

  await asScout.post(thread.id, "and the logs are quiet");
  const later = await rig.until((model) => model.thread?.messages.length === 4 && model.thread.unread === 0, "the next reply, read");
  assert.deepEqual(firstNew(later), [false, true, false, false]);
});

test("a reply that comes while the person looks at the thread is not told apart as new, and one that comes while they look away is", { timeout }, async (t) => {
  const rig = await startRig(t);
  const scout = await rig.member("scout");
  const asScout = await rig.asAgent("scout");
  const thread = await rig.thread("scout", "check the disk");
  await rig.until((model) => model.open.list?.id === scout.id, "scout's list");

  rig.state.openThread(thread.id);
  rig.state.look(true);
  await rig.until((model) => model.thread?.messages.length === 1, "the thread");
  await asScout.post(thread.id, "43% used");
  const watched = await rig.until((model) => model.thread?.messages.length === 2 && model.thread.unread === 0, "the reply, read as it came");
  assert.deepEqual(firstNew(watched), [false, false]);

  rig.state.look(false);
  await asScout.post(thread.id, "the rest is photos");
  await rig.until((model) => model.thread?.messages.length === 3 && model.thread.unread === 1, "a reply the person has not looked at");
  rig.state.look(true);
  const back = await rig.until((model) => model.thread?.messages.length === 3 && model.thread.unread === 0, "the reply, read on looking again");
  assert.deepEqual(firstNew(back), [false, false, true]);
});

test("a message shows each emoji with who put it there, a failed receipt apart, the agents it names and whether it is a command", { timeout }, async (t) => {
  const rig = await startRig(t);
  const scout = await rig.member("scout");
  const you = await rig.person();
  const asScout = await rig.asAgent("scout");
  const thread = await rig.thread("scout", "@scout is the disk full?");
  const [asked] = await you.read(thread.id, null, 10);
  assert.ok(asked);
  await you.react(asked.id, "👍");
  await asScout.react(asked.id, "👀");
  await asScout.leaveReceipt([asked.event], { status: "failed", reply: null, detail: "The model failed." });
  await you.post(thread.id, "/stop");
  await rig.until((model) => model.open.list?.id === scout.id, "scout's list");

  rig.state.openThread(thread.id);
  const shown = await rig.until((model) => model.thread?.messages.length === 2 && model.thread.messages[0]?.receipts.length === 1, "the thread");
  const [first, stop] = threadLevel(shown, at)?.messages ?? [];
  assert.ok(first && stop);
  assert.deepEqual(
    first.reactions.map((each) => each.emoji),
    ["👍", "👀"],
  );
  assert.deepEqual(
    first.receipts.map((each) => each.failed),
    [true],
  );
  assert.equal(withMentions(first.text, first.mentions).filter((part) => typeof part !== "string").length, 1, "the agent named is marked where it is named");
  assert.deepEqual([first.command, stop.command], [false, true]);
});

test("a trigger's line says which trigger fired and when, with what its check printed or else its prompt, the mark for what is new before it and the receipt on it", { timeout }, async (t) => {
  const rig = await startRig(t);
  const scout = await rig.member("scout");
  const asScout = await rig.asAgent("scout");
  const thread = await rig.thread("scout", "watch the shopping list");
  await rig.until((model) => model.open.list?.id === scout.id, "scout's list");
  rig.state.openThread(thread.id);
  rig.state.look(true);
  await rig.until((model) => model.thread?.messages.length === 1 && model.thread.unread === 0, "the thread, read");

  rig.state.look(false);
  const firedAt = Date.now();
  const checked = await asScout.fire(thread.id, { trigger: "groceries", firedAt, prompt: "Say what is on the list.", output: "14\n" });
  await asScout.fire(thread.id, { trigger: "nightly", firedAt, prompt: "Run the snapshot.", output: null });
  await asScout.leaveReceipt([checked.event], { status: "failed", reply: null, detail: "The model failed." });
  await rig.until((model) => model.thread?.messages.length === 3 && model.thread.messages[1]?.receipts.length === 1, "both lines, and the receipt");
  rig.state.look(true);
  const shown = await rig.until((model) => model.thread?.unread === 0, "the lines, read");

  const [, groceries, nightly] = threadLevel(shown, at)?.messages ?? [];
  assert.ok(groceries && nightly);
  assert.deepEqual([groceries.kind, nightly.kind], ["trigger", "trigger"]);
  assert.deepEqual([groceries.who, nightly.who], [triggerLabel("groceries"), triggerLabel("nightly")]);
  assert.deepEqual([groceries.text, nightly.text], ["14", "Run the snapshot."], "what the check printed, and the prompt of a trigger with no check");
  assert.deepEqual(firstNew(shown), [false, true, false], "the first line is the first thing new");
  assert.deepEqual(
    groceries.receipts.map((each) => each.failed),
    [true],
  );
});

test("renaming and archiving are the client's own, posting nothing, and an archived thread stands apart at the foot of its list with nothing in it new", { timeout }, async (t) => {
  const rig = await startRig(t);
  const scout = await rig.member("scout");
  const asScout = await rig.asAgent("scout");
  const thread = await rig.thread("scout", "check the disk");
  await asScout.post(thread.id, "43% used");
  await rig.until((model) => model.open.list?.id === scout.id && model.dms[scout.id]?.unread[thread.id] === 1, "scout's list, with the reply new");
  rig.state.openThread(thread.id);
  await rig.until((model) => model.thread?.thread.id === thread.id, "the thread");

  assert.equal(await rig.state.write("/rename  the   disk "), true);
  await rig.until((model) => model.thread?.thread.name === "the disk", "the new name");
  assert.equal(await rig.state.write("/archive"), true);
  const archived = await rig.until((model) => listLevel(model, at)?.archived?.rows.length === 1, "the thread among the archived");
  const list = listLevel(archived, at);
  assert.ok(!list?.rows.some((row) => row.id === thread.id), "it has left the rest of the list");
  assert.deepEqual(list?.archived?.rows.map((row) => [row.id, row.label, row.unread]), [[thread.id, "the disk", 0]]);
  assert.equal(countOn(agentsLevel(archived, at).rows, "agent", scout.id), 0, "nothing in it counts as new");
  assert.equal(threadLevel(archived, at)?.archived, true);

  assert.equal(await rig.state.write("/unarchive"), true);
  const back = await rig.until((model) => listLevel(model, at)?.archived === undefined, "the thread back in the list");
  assert.ok(listLevel(back, at)?.rows.some((row) => row.id === thread.id));
  assert.deepEqual(
    back.thread?.messages.map((message) => message.text),
    ["check the disk", "43% used"],
    "nothing was posted",
  );
});

test("an agent's list that waits on another version of it names the agent and the Shrimpy it runs", { timeout: 30_000 }, async (t) => {
  const rig = await startRig(t, { agents: [] });
  await linkTestAgent(t, "scout", { serving: servingAnotherAgent });

  const waiting = await rig.until((model) => model.agent?.state === "down" && model.agent.why.kind === "other-version", "scout's list to wait on its version");
  const notes = listLevel(waiting, at)?.notes ?? [];
  assert.ok(notes.some((note) => note.includes("scout") && note.includes(SHRIMPY_VERSION)), notes.join("\n"));
});

/** A real agent called crab, made with `agent init` and started as `shrimpy agent serve` starts it, with the model local/test-model, and local/other-model beside it. */
async function startCrab(t: TestContext): Promise<{ rig: Rig; home: string; crab: Child<unknown> }> {
  const rig = await startRig(t, { agents: [] });
  const home = join(tempDir(t, "crab-home"), "crab");
  // A Shrimpy folder of its own, so that a real one never reaches the agent.
  const env = { SHRIMPY_DIR: tempDir(t, "folder") };
  const made = await runChild({ file: SHRIMPY_ENTRY, args: ["agent", "init", home, "--name", "crab", "--model", "local/test-model"], env }).ended;
  assert.equal(made.code, 0, made.stderr);
  // The agent starts only with its model's provider declared. Nothing here asks the model anything.
  const model = { id: "test-model", reasoning: true, contextWindow: 262_144, maxTokens: 65_536 };
  const local = { baseUrl: "http://127.0.0.1:9/v1", api: "openai-completions", apiKey: "local", models: [model, { ...model, id: "other-model" }] };
  writeFileSync(join(home, "state", "pi", "models.json"), JSON.stringify({ providers: { local } }));
  const crab = await startChild(t, { file: SHRIMPY_ENTRY, args: ["agent", "serve", home], env });
  return { rig, home, crab };
}

test("an agent's look follows its home's files while it runs, and is worked out from its member ID while it does not", { timeout: 90_000 }, async (t) => {
  const { rig, home, crab } = await startCrab(t);
  const looked = (model: Model): Look | undefined => agentsLevel(model, at).rows.find((row) => row.kind === "agent")?.look;
  const config = (): { pigment: string; sigil: unknown } => JSON.parse(readFileSync(join(home, "agent.json"), "utf8")) as { pigment: string; sigil: unknown };
  const sigil = parseSigil(config().sigil);
  assert.ok(sigil, "a new home has a sigil");
  const { pigment } = config();

  await rig.until((model) => looked(model)?.sigil.join() === sigil.join() && looked(model)?.pigment === pigment, "crab's look as its home has it");
  const frame = ["#".repeat(12), ...Array.from({ length: 10 }, () => `#${".".repeat(10)}#`), "#".repeat(12)];
  const other = PIGMENTS.find((each) => each !== pigment);
  writeFileSync(join(home, "agent.json"), `${JSON.stringify({ ...config(), sigil: frame, pigment: other }, null, 2)}\n`);
  await rig.until((model) => looked(model)?.sigil.join() === frame.join() && looked(model)?.pigment === other, "crab's look as its home has it now");

  await crab.kill();
  const fromId = lookFromId((await rig.member("crab")).id);
  await rig.until((model) => looked(model)?.sigil.join() === fromId.sigil.join() && looked(model)?.pigment === fromId.pigment, "the look worked out from crab's member ID");
});

test("a running agent's page names its default model and its version, follows a change of model, and an agent that stops takes no thread", { timeout: 90_000 }, async (t) => {
  const { rig, crab } = await startCrab(t);
  const list = (model: Model): ListLevel | undefined => listLevel(model, at);
  const facts = (model: Model): string | undefined => pageLevel(model, { ...at, opened: new Set() })?.facts.map((fact) => `${fact.label} ${fact.value}`).join("\n");

  // The only agent's list is opened by itself.
  const named = (said: string | undefined, id = "test-model"): boolean => said !== undefined && said.includes(`model local/${id}`) && said.includes(`version ${SHRIMPY_VERSION}`);
  const running = await rig.until((model) => named(facts(model)), "crab's model and version");
  assert.deepEqual([list(running)?.off, list(running)?.startable], [false, true]);

  // Another client sets crab's model, and the page follows without asking crab again.
  const other = await (await rig.gateway()).connect();
  const held = await other.host.get(Agent, { agent: (await rig.member("crab")).id }, BACKGROUND_CONTEXT);
  valueOf(await held.setModel({ model: { provider: "local", id: "other-model" } }, BACKGROUND_CONTEXT));
  await rig.until((model) => named(facts(model), "other-model"), "crab's new model on its page");

  await crab.kill();
  const stopped = await rig.until((model) => list(model)?.off === true, "crab to be said not to run");
  assert.deepEqual([named(facts(stopped)), list(stopped)?.startable], [false, false]);
});

test("an agent that is off says on its page where it lives, and one the gateway turned away says which release it runs", () => {
  const crab = agentMember("crab");
  const where = { machine: { host: "zachs-mbp", system: "macOS arm64", account: "zach" }, home: "/Users/zach/shrimpy/agents/crab" };
  const listing = aListing([aChatServer()]);
  const off = aModel({
    listing: { ...listing, members: [...listing.members, { ...crab, admin: false, reachable: false, where, lastLinked: Date.now() }] },
    open: { list: { kind: "agent", id: crab.id }, item: undefined },
  });
  const page = (model: Model) => pageLevel(model, { ...at, opened: new Set() });
  const said = (model: Model): string => JSON.stringify(page(model)?.facts) + (page(model)?.note ?? "");
  assert.deepEqual([page(off)?.off, page(off)?.triggers, page(off)?.home], [true, undefined, []], "its triggers and home are not read");
  assert.ok(said(off).includes("zachs-mbp") && page(off)?.note?.includes("zachs-mbp"), "it says which machine it lives on");

  const turnedAway = { kind: "agent" as const, name: "crab", member: crab.id, shrimpy: "1.0.0-rc.1", pi: { "@earendil-works/pi-durable": "0.0.1" } };
  const away = { ...off, listing: { ...off.listing!, turnedAway: [turnedAway] } };
  assert.ok(said(away).includes("1.0.0-rc.1") && page(away)?.note?.includes("1.0.0-rc.1"), "the release it runs, and what to update");
  assert.equal(agentsLevel(away, at).rows.find((row) => row.id === crab.id)?.detail, TURNED_AWAY, "its row says it was turned away");
});

test("no one is said to work while the gateway is out of reach, whatever chat last marked", () => {
  const scout = agentMember("scout");
  const busy = aThread("th_1", { working: [{ memberId: scout.id, since: 0 }] });
  const model = aModel({ listing: aListing([anAgent("scout"), aChatServer()]), dms: { [scout.id]: aDm("scout", [busy]) } });
  assert.equal(agentsLevel(model, at).rows.find((row) => row.id === scout.id)?.working, true);

  const lost = { ...model, gateway: CONNECTING, chat: CONNECTING };
  assert.equal(agentsLevel(lost, at).rows.find((row) => row.id === scout.id)?.working, false);
  const opened = listLevel({ ...lost, open: { list: { kind: "agent", id: scout.id }, item: undefined } }, at);
  assert.deepEqual([opened?.working, opened?.rows.map((row) => row.working)], [false, [false]]);
});

test("a pinned thread is tagged so, in a room's list and on an agent's", () => {
  const scout = agentMember("scout");
  const pinned = aThread("th_1", { pinned: 1, channelId: "ch_2", updatedAt: 1 });
  const room = aRoom("ops", ["scout"], [pinned, aThread("th_2", { channelId: "ch_2", updatedAt: 2 })]);
  const tagsOf = (open: Model["open"]): string[][] | undefined =>
    listLevel(aModel({ listing: aListing([anAgent("scout"), aChatServer()]), rooms: { ch_2: room }, open }), at)?.rows.map((row) => row.tags);

  assert.deepEqual(tagsOf({ list: { kind: "room", id: "ch_2" }, item: undefined }), [[PINNED], []]);
  const ofScout = aModel({
    listing: aListing([anAgent("scout"), aChatServer()]),
    rooms: { ch_2: room },
    sessions: [aSession("th_1", { place: { kind: "room", room: "ops", thread: { name: null } } })],
    open: { list: { kind: "agent", id: scout.id }, item: undefined },
  });
  assert.deepEqual(listLevel(ofScout, { ...at, tab: "observe" })?.rows.map((row) => [row.id, row.tags]), [["th_1", [PINNED]]]);
});

test("the terminal's first screen says when this machine is behind the gateway, and a page's never does", () => {
  const [major = 0, minor = 0] = SHRIMPY_VERSION.split(/[.-]/).map(Number);
  const newer = `${String(major)}.${String(minor + 1)}.0`;
  const behind = aModel({ listing: aListing([aChatServer()], newer) });
  const level = (model: Model, updates: boolean): string[] => agentsLevel(model, { ...at, updates }).notes.filter((note) => note.includes(newer));

  assert.equal(level(behind, true).length, 1, "the terminal says so");
  assert.deepEqual(level(behind, false), [], "a page comes from the gateway");
  assert.deepEqual(agentsLevel(aModel({ listing: aListing([aChatServer()]) }), { ...at, updates: true }).notes, [], "nothing is said on the gateway's version");
});
