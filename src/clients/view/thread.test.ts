import assert from "node:assert/strict";
import { test } from "node:test";
import { activityWords, modelWords, type SessionActivity } from "../../contracts/agent/index.ts";
import type { Model } from "../state/index.ts";
import { aChatServer, aDm, agentMember, aListing, aModel, anAgent, aRoom, aThread, aThreadView, onThread, sessionView, workingView } from "../state/testing/index.ts";
import { agentsLevel, listLevel, pageLevel, threadLevel } from "./index.ts";

/*
 * What the open thread's level says of the sessions behind it, from what each agent's session says of itself.
 */

const at = { now: Date.now(), self: "this test" };
const open = aThread("th_1", { preview: "Check the disk" });
const scout = agentMember("scout");
const mechanic = agentMember("mechanic");
const reading: SessionActivity = { kind: "tool", name: "read" };

/** The thread open in a room the person is in with scout and mechanic, from the room's list. */
function inRoom(behind: Model["behind"]): Model {
  const room = aRoom("lab", ["scout", "mechanic"], [open]);
  const place = { kind: "room" as const, id: room.channel.id };
  return onThread("scout", open, aThreadView(open, []), {
    open: { list: place, item: { kind: "thread", place, thread: open.id, side: undefined } },
    rooms: { [room.channel.id]: room },
    behind,
  });
}

test("a thread says what its one working agent is doing, whichever list it was opened from, and not while several work", () => {
  const one = threadLevel(inRoom({ [mechanic.id]: workingView([], reading) }), at)?.working ?? "";
  assert.ok(one.includes(activityWords(reading)), one);

  const both = threadLevel(inRoom({ [mechanic.id]: workingView([], reading), [scout.id]: workingView([]) }), at)?.working ?? "";
  assert.ok(both !== "" && !both.includes(activityWords(reading)), both);
});

test("a DM's thread names its model under the title only while the session has one of its own", () => {
  const model = { provider: "local", id: "chosen-model" };
  const subOf = (ownModel: boolean): string[] =>
    threadLevel(onThread("scout", open, aThreadView(open, []), { behind: { [scout.id]: sessionView({ status: { model, ownModel } }) } }), at)?.sub ?? [];
  assert.ok(subOf(true).includes(modelWords(model)), subOf(true).join(" · "));
  assert.ok(!subOf(false).includes(modelWords(model)), subOf(false).join(" · "));
});

test("background commands light the working lantern while waiting alone does not, and thread commands follow what is still going", () => {
  const now = at.now;
  const dm = aDm("scout", [open]);
  const proc = { id: "proc_1", command: "npm run build", threadId: open.id, startedAt: now - 120_000, pid: 42 };
  const watch = {
    id: "w_1",
    fromThread: open.id,
    toThread: "th_dm_mech",
    onAgent: mechanic.id,
    onAgentName: "mechanic",
    startedAt: now - 60_000,
  };
  const once = { id: "once_1", threadId: open.id, askedAt: now - 30_000, due: now + 300_000, prompt: "Check the deploy" };
  const standing = {
    name: "nightly",
    schedule: { cron: "0 3 * * *", timezone: "UTC" },
    on: true,
    next: now + 3_600_000,
    last: null,
    lastCheck: null,
    thread: open.id,
  };

  // Waiting alone: no lantern, rail says waiting on mechanic.
  const waitingOnly = aModel({
    listing: aListing([anAgent("scout"), aChatServer()]),
    dms: { [scout.id]: dm },
    watchesByAgent: { [scout.id]: [watch] },
    open: { list: { kind: "agent", id: scout.id }, item: { kind: "thread", place: { kind: "agent", id: scout.id }, thread: open.id, side: undefined } },
    thread: aThreadView(open, []),
  });
  const scoutRowWaiting = agentsLevel(waitingOnly, at).rows.find((row) => row.id === scout.id);
  assert.ok(scoutRowWaiting);
  assert.equal(scoutRowWaiting.working, false, "waiting alone does not light the lantern");
  assert.match(scoutRowWaiting.detail, /waiting on mechanic/);
  const waitView = threadLevel(waitingOnly, at);
  assert.ok(waitView);
  assert.equal(waitView.still.watches.length, 1);
  assert.equal(waitView.still.watches[0]?.onRunning, false, "mechanic is not running in listing");
  assert.ok(waitView.commands.some((cmd) => cmd.name === "/drop"), "/drop is offered when a watch is open");
  assert.ok(!waitView.commands.some((cmd) => cmd.name === "/kill"), "/kill is hidden when no process runs");

  // Running background command + watch + triggers: lantern lights, page lists processes & once, commands match.
  const active = {
    ...waitingOnly,
    processesByAgent: { [scout.id]: [proc] },
    onceTriggersByAgent: { [scout.id]: [once] },
    triggersByAgent: { [scout.id]: [standing] },
    triggers: [standing],
  };
  assert.equal(agentsLevel(active, at).rows.find((row) => row.id === scout.id)?.working, true, "a background command lights the lantern");
  assert.equal(listLevel(active, at)?.rows.find((row) => row.id === open.id)?.working, true);
  const activeThread = threadLevel(active, at);
  assert.ok(activeThread);
  assert.equal(activeThread.still.processes.length, 1);
  assert.equal(activeThread.still.triggers.length, 2);
  const cmdNames = activeThread.commands.map((cmd) => cmd.name);
  for (const expected of ["/kill", "/drop", "/cancel", "/pause"]) assert.ok(cmdNames.includes(expected), `${expected} offered`);
  assert.ok(!cmdNames.includes("/resume"), "/resume hidden when no paused trigger");

  const page = pageLevel({ ...active, open: { list: { kind: "agent", id: scout.id }, item: undefined } }, { ...at, opened: new Set() });
  assert.ok(page);
  assert.equal(page.processes.length, 1);
  assert.equal(page.once.length, 1);
  const [stateFact] = page.facts;
  assert.ok(stateFact);
  assert.equal(stateFact.working, true);
  assert.match(stateFact.sub ?? "", /waiting on mechanic/);

  // Reverse watch on the watched thread itself.
  const watchedThread = aThread("th_dm_mech", { preview: "Can you check the build?" });
  const reverse = aModel({
    listing: aListing([anAgent("scout"), anAgent("mechanic"), aChatServer()]),
    dms: { [scout.id]: dm },
    watchesByAgent: { [scout.id]: [watch] },
    open: { list: { kind: "agent", id: scout.id }, item: { kind: "thread", place: { kind: "read-only", id: "ch_dm_2" }, thread: watchedThread.id, side: undefined } },
    thread: aThreadView(watchedThread, []),
  });
  const revView = threadLevel(reverse, at);
  assert.ok(revView);
  const [rev] = revView.still.waitedBy;
  assert.ok(rev);
  assert.equal(rev.byName, "scout");
  assert.equal(rev.fromThread, open.id);
});
