import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fauxAssistantMessage, type Message } from "@earendil-works/pi-ai";
import type { Occurrence, TriggerDetail } from "../contracts/agent/index.ts";
import { parseTrigger } from "../contracts/agent/node.ts";
import { talkTo } from "../contracts/chat/testing/index.ts";
import { isRefusal } from "../lib/refusal/index.ts";
import { eventually, stopAfter, tempDir, useRuntimeDir, waitForView } from "../lib/testing/index.ts";
import { localTime } from "../lib/time/index.ts";
import { homePaths } from "./home/index.ts";
import {
  type AgentConnection,
  callingTools,
  connectAgent,
  loggedRequests,
  releaseGate,
  removeTrigger,
  SCOUT,
  type Script,
  type SessionView,
  startAgentChild,
  startAgentRig,
  startChatServer,
  writeTrigger,
} from "./testing/index.ts";

const timeout = 40_000;
const SHORTEST = 200;

function textOf(message: Message | undefined): string {
  if (message?.role !== "user") return "";
  return typeof message.content === "string" ? message.content : message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

const inputsOf = (view: SessionView): string[] => view.items.flatMap((item) => (item.type === "user" ? [item.text] : []));

const trigger = (connection: AgentConnection, name: string, done: (detail: TriggerDetail) => boolean, what: string, timeoutMs = 20_000) =>
  eventually(() => connection.trigger(name), done, { what, timeoutMs });

const ended = (detail: TriggerDetail, how: Occurrence["ended"]): number => detail.occurrences.filter((occurrence) => occurrence.ended === how).length;

test("the trigger tool schedules one-time and recurring triggers in the current thread, pauses, resumes, and removes them", { timeout }, async (t) => {
  const model = callingTools(
    [
      [
        { name: "trigger", args: { action: "add", in: "1s", prompt: "Check deploy status." } },
        { name: "trigger", args: { action: "add", name: "hourly", every: "1h", prompt: "Hourly summary." } },
        { name: "trigger", args: { action: "list" } },
      ],
    ],
    "Scheduled both.",
  );
  const rig = await startAgentRig(t, { script: model.script, shortestEveryMs: SHORTEST, tokensPerSecond: 1_000_000 });
  const connection = await rig.connect();

  await rig.receiptOn(await rig.say("schedule those"));
  assert.equal(model.answers.every((a) => !a.isError), true, JSON.stringify(model.answers));
  const listed = model.answers[2]?.text ?? "";
  assert.ok(listed.includes("hourly") && listed.includes("Check deploy status."), listed);

  // Standing trigger defaulted to the current thread and was picked up immediately.
  const standing = await connection.triggers();
  assert.equal(standing.length, 1);
  assert.deepEqual([standing[0]?.name, standing[0]?.thread, standing[0]?.on], ["hourly", rig.thread.id, true]);

  // One-time trigger fires into the same thread with a wake line (`name: null`) and wakes the agent.
  await eventually(
    async () => (await rig.said()).some((m) => m.wake?.kind === "trigger" && m.wake.name === null && m.wake.prompt === "Check deploy status."),
    (found) => found,
    { what: "the one-time trigger wake line to appear" },
  );
  await eventually(
    async () => (await rig.replies()).length >= 2,
    (done) => done,
    { what: "the agent to reply to the one-time trigger" },
  );

  // Trigger file missing `thread:` is strictly rejected into `leftOut`.
  writeTrigger(rig.home, "legacy", ["every: 1h"], "No thread specified.");
  const reloaded = await connection.reload();
  assert.ok(reloaded.leftOut.some((item) => item.file === "triggers/legacy.md" && item.reason.includes("thread")), JSON.stringify(reloaded.leftOut));
});

test("cancelTrigger cancels a pending one-time trigger silently without posting a wake line", { timeout }, async (t) => {
  const rig = await startAgentRig(t, { scenario: "mixed", tokensPerSecond: 1_000_000 });
  const connection = await rig.connect();

  await rig.receiptOn(await rig.say("check back in 60s"));
  const pending = await eventually(() => connection.onceTriggers(), (list) => list.length === 1, { what: "one-time trigger to be listed" });
  assert.equal(pending[0]?.threadId, rig.thread.id);

  await connection.cancelTrigger(pending[0]!.id);
  await eventually(() => connection.onceTriggers(), (list) => list.length === 0, { what: "one-time trigger to disappear" });
  const wakes = (await rig.said()).filter((m) => m.wake !== null);
  assert.equal(wakes.length, 0, "cancelling a one-time trigger leaves no wake line");
});

test("firing a trigger now makes an occurrence, keeps the schedule, and runs nothing over", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  const rig = await startAgentRig(t, { home, scenario: "gated", shortestEveryMs: SHORTEST });
  const connection = await rig.connect();
  writeTrigger(home, "weekly", ["every: 1h", `thread: ${rig.thread.id}`], "Write the weekly summary.");
  writeTrigger(home, "parked", ["every: 1h", `thread: ${rig.thread.id}`, "enabled: false"], "Never run on its own.");
  await connection.reload();

  const listed = await connection.triggers();
  assert.deepEqual(listed.map(({ name, on, last }) => [name, on, last]), [["parked", false, null], ["weekly", true, null]]);
  const [parked, weekly] = listed;
  assert.equal(parked?.next, null, "a trigger that is off has no next time");
  assert.ok(weekly?.next !== null && weekly?.next !== undefined && Math.abs(weekly.next - Date.now() - 3_600_000) < 60_000, "an hour from when it was first seen");
  assert.deepEqual(weekly.schedule, { every: "1h" });

  const fired = await connection.fire("weekly");
  assert.deepEqual([fired.byHand, fired.ended], [true, null]);
  const again = await connection.fire("weekly");
  assert.equal(again.ended, "skipped", "a second one is not run over the first, which is still going");
  assert.ok(again.reason?.includes("still going"), String(again.reason));
  assert.equal((await connection.fire("parked")).ended, null, "a trigger that is off can still be run");
  await assert.rejects(connection.fire("nothing"), isRefusal);
  await assert.rejects(connection.trigger("nothing"), isRefusal);

  releaseGate(home);
  const detail = await trigger(connection, "weekly", (found) => found.last?.ended === "skipped" && ended(found, "answered") === 1, "the first to be answered");
  assert.deepEqual(detail.occurrences.map((occurrence) => occurrence.ended), ["skipped", "answered"], "newest first");
  assert.equal(detail.occurrences[1]?.id, fired.id);
  assert.equal(detail.next, weekly.next, "firing it by hand left the schedule as it was");
  assert.equal(detail.prompt, "Write the weekly summary.");
  assert.deepEqual(rig.reports, []);
});

test("a trigger runs in the session behind its thread, or fails its occurrence when it can't", { timeout: 60_000 }, async (t) => {
  const home = tempDir(t, "agent");
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const script: Script = async (messages) => {
    const latest = textOf(messages.findLast((message) => message.role === "user"));
    if (["Tidy the notes.", "Write the report."].some((prompt) => latest.includes(prompt))) await gate;
    return fauxAssistantMessage(`Seen: ${latest}`);
  };
  const rig = await startAgentRig(t, { home, script, shortestEveryMs: SHORTEST });
  const connection = await rig.connect();
  await rig.receiptOn(await rig.say("hello"));
  const side = await rig.newThread("Reports");
  assert.deepEqual((await connection.sessions()).map((each) => each.id), [rig.thread.id]);
  writeTrigger(home, "tidy", ["every: 1s", `thread: ${rig.thread.id}`], "Tidy the notes.");
  writeTrigger(home, "report", ["every: 1s", `thread: ${side.id}`], "Write the report.");
  writeTrigger(home, "lost", ["every: 1s", "thread: th_aaaaaaaaaaaa"], "Never gets anywhere.");

  const reloaded = await connection.reload();
  assert.deepEqual(reloaded.leftOut, []);
  assert.equal(reloaded.triggers, 3);
  await rig.untilWorking();
  open();
  await trigger(connection, "tidy", (found) => ended(found, "answered") >= 1, "the occurrence to be answered");

  const said = await rig.said();
  const line = said.find((message) => message.wake?.kind === "trigger" && message.wake.name === "tidy");
  assert.ok(line && line.wake?.kind === "trigger");
  assert.deepEqual([line.author.id, line.wake.prompt, line.wake.output], [rig.partner.id, "Tidy the notes.", null]);
  const reply = said.find((message) => message.seq > line.seq && message.author.id === rig.partner.id && message.wake === null);
  for (const fact of [rig.thread.id, rig.thread.channelId, "tidy", "Tidy the notes."]) assert.ok(reply?.text.includes(fact), `${fact} in ${String(reply?.text)}`);
  assert.deepEqual(
    line.receipts.map((receipt) => [receipt.status, receipt.reply]),
    [["answered", reply?.id]],
  );
  const { session } = await rig.attach();
  const inputs = inputsOf(session.view);
  assert.ok(inputs.some((text) => text.includes("hello")) && inputs.some((text) => text.includes("Tidy the notes.")));
  await rig.untilIdle();

  await trigger(connection, "report", (found) => ended(found, "answered") >= 1, "the occurrence to make its session and be answered");
  const made = (await connection.sessions()).find((each) => each.id === side.id);
  assert.deepEqual([made?.threadId, made?.channelId], [side.id, rig.thread.channelId]);
  assert.deepEqual(
    made?.place,
    { kind: "dm", with: { name: rig.me.name, kind: "person" }, thread: { name: "Reports" } },
    "and it knows where that is, which the first occurrence asked chat",
  );
  const [first] = (await rig.replies(side.id)).map((reply) => reply.text);
  for (const fact of [side.id, rig.thread.channelId, "report", "Write the report."]) assert.ok(first?.includes(fact), `${fact} in ${String(first)}`);
  const asked = await rig.say("and what else?", side.id);
  assert.equal((await rig.receiptOn(asked)).status, "answered");
  const inSide = inputsOf((await rig.attach(side.id)).session.view);
  assert.ok(inSide.some((text) => text.includes("Write the report.")) && inSide.some((text) => text.includes("and what else?")));

  const lost = await trigger(connection, "lost", (found) => ended(found, "failed") >= 1, "the occurrence with nowhere to go to fail");
  assert.notEqual(lost.occurrences[0]?.reason ?? null, null, "and says why");
  assert.ok(rig.reports.some((report) => (report as Error).message.includes("th_aaaaaaaaaaaa")), "and it was reported");
  assert.ok(!(await connection.sessions()).some((each) => each.id === "th_aaaaaaaaaaaa"));

  for (const name of ["tidy", "report", "lost"]) removeTrigger(home, name);
  await rig.chat.outage();
  writeTrigger(home, "away", ["every: 1s", "thread: th_bbbbbbbbbbbb"], "Nothing reaches it.");
  await connection.reload();
  const away = await trigger(connection, "away", (found) => ended(found, "failed") >= 1, "the occurrence to fail while chat is away", 30_000);
  assert.notEqual(away.occurrences[0]?.reason ?? null, null, "and says why");
});

test("an agent down past several of a trigger's times runs it once when it starts, then keeps to its schedule", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  const first = await startAgentRig(t, { home, shortestEveryMs: SHORTEST, scenario: "chat" });
  writeTrigger(home, "tidy", ["every: 1s", `thread: ${first.thread.id}`]);
  const before = await first.connect();
  await before.reload();
  await eventually(async () => (await before.triggers())[0]?.next, (next) => typeof next === "number", { what: "the trigger to wait for its time" });
  await first.agent.close();
  await delay(2_500);

  const second = await startAgentRig(t, { home, chat: first.chat, shortestEveryMs: SHORTEST, scenario: "chat" });
  const connection = await second.connect();

  const once = await trigger(connection, "tidy", (found) => found.occurrences.length >= 1, "the missed time to be made up");
  const [late] = once.occurrences;
  assert.equal(once.occurrences.length, 1);
  assert.ok(late !== undefined && late.firedAt - late.due >= 1_500, "it was due while the agent was down, and runs when it is back");
  const kept = await trigger(connection, "tidy", (found) => found.occurrences.length >= 2, "the schedule to go on");
  assert.equal(kept.occurrences.length, 2, "the time made up and the next one, and not again for each time it missed");
  assert.ok((kept.occurrences[0]?.firedAt ?? 0) - late.firedAt >= 900, "a second after it ran, not a second after it was due");
});

test("a trigger's first run in a thread, due while the agent was down, waits at the start for chat to link", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  const first = await startAgentRig(t, { home, shortestEveryMs: SHORTEST, scenario: "chat" });
  const side = await first.newThread("Reports");
  writeTrigger(home, "report", ["every: 3s", `thread: ${side.id}`], "Write the report.");
  const before = await first.connect();
  assert.equal((await before.reload()).triggers, 1);
  const due = (await before.triggers())[0]?.next;
  assert.ok(typeof due === "number");
  await first.agent.close();
  assert.ok(Date.now() < due, "the agent was down before the trigger's time");
  await first.chat.outage();
  await delay(due - Date.now() + 300);
  await startAgentChild(t, home, "chat", 400, { shortestEveryMs: SHORTEST });
  await delay(1_000);
  await first.chat.recover();

  const connection = await connectAgent(t, home);
  stopAfter(t, () => connection.close().catch(() => undefined));
  const ran = await trigger(connection, "report", (found) => ended(found, "answered") >= 1, "an occurrence to be answered");
  const oldest = ran.occurrences.at(-1);
  assert.deepEqual([oldest?.due, oldest?.ended], [due, "answered"], "the one that fell due while the agent was down ran, and did not fail");
  assert.ok((await connection.sessions()).some((session) => session.id === side.id), "in a session made behind the thread");
});

test("an occurrence due while the last one still goes is skipped, or handed over behind it with overlap allowed", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  const rig = await startAgentRig(t, { home, scenario: "gated", shortestEveryMs: SHORTEST });
  const connection = await rig.connect();
  const sideA = await rig.newThread("Skips");
  const sideB = await rig.newThread("Queues");
  writeTrigger(home, "skips", ["every: 1s", `thread: ${sideA.id}`]);
  writeTrigger(home, "queues", ["every: 1s", `thread: ${sideB.id}`, "overlap: allow"]);
  await connection.reload();

  const skips = await trigger(connection, "skips", (found) => ended(found, "skipped") >= 2, "occurrences to be skipped");
  const queues = await trigger(connection, "queues", (found) => ended(found, null) >= 3, "occurrences to wait behind the first");
  assert.equal(ended(skips, null), 1, "the first is going and the rest were skipped");
  assert.equal(ended(queues, "skipped"), 0, "none was skipped");
  const watched = await connection.attach(sideB.id);
  await waitForView(watched, (view) => view.status.queued.length >= 2);

  releaseGate(home);
  const going = (detail: TriggerDetail) => detail.occurrences.filter((occurrence) => occurrence.ended === null).map((occurrence) => occurrence.id);
  const wasGoing = going(skips);
  const wereWaiting = going(queues);
  const answers = (detail: TriggerDetail, ids: string[]) => ids.every((id) => detail.occurrences.find((occurrence) => occurrence.id === id)?.ended === "answered");
  await trigger(connection, "skips", (found) => answers(found, wasGoing), "the one that was going to be answered");
  await trigger(connection, "queues", (found) => answers(found, wereWaiting), "every one that waited to be answered, in its turn");
  assert.ok(ended(await connection.trigger("skips"), "skipped") >= 2, "and the skipped ones stay skipped");
});

test("reloading makes the triggers follow their files", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  const rig = await startAgentRig(t, { home, scenario: "chat", shortestEveryMs: SHORTEST });
  const connection = await rig.connect();
  const threadA = (await rig.newThread("A")).id;
  const threadB = (await rig.newThread("B")).id;
  const threadC = (await rig.newThread("C")).id;
  const threadD = (await rig.newThread("D")).id;
  writeTrigger(home, "a", ["every: 1h", `thread: ${threadA}`], "first prompt");
  writeTrigger(home, "b", ["every: 1s", `thread: ${threadB}`]);
  writeTrigger(home, "c", ["every: 1s", `thread: ${threadC}`]);
  writeTrigger(home, "d", ["every: 1s", `thread: ${threadD}`]);
  writeTrigger(home, "e", ["every: soon", `thread: ${threadA}`]);
  writeTrigger(home, ".hidden", ["every: 1s", `thread: ${threadA}`]);
  writeFileSync(join(homePaths(home).triggers, "notes.txt"), "not a trigger");

  const firstReload = await connection.reload();
  assert.deepEqual(firstReload.leftOut.map(({ file }) => file), ["triggers/e.md"]);
  assert.deepEqual((await connection.triggers()).map(({ name }) => name), ["a", "b", "c", "d"]);
  for (const name of ["b", "c", "d"]) await trigger(connection, name, (found) => found.occurrences.length >= 1, `${name} to run`);

  writeTrigger(home, "a", ["every: 2s", `thread: ${threadA}`], "first prompt");
  assert.deepEqual((await connection.reload()).leftOut.map(({ file }) => file), ["triggers/e.md"]);
  const ran = await trigger(connection, "a", (found) => found.occurrences.length >= 1, "the new schedule to take effect");

  writeTrigger(home, "a", ["every: 2s", `thread: ${threadA}`], "second prompt");
  removeTrigger(home, "b");
  writeTrigger(home, "c", ["every: 1s", `thread: ${threadC}`, "enabled: false"]);
  writeTrigger(home, "d", ["every: soon", `thread: ${threadD}`]);
  const answer = await connection.reload();

  assert.deepEqual(answer.leftOut.map(({ file }) => file), ["triggers/d.md", "triggers/e.md"]);
  assert.ok(answer.leftOut[0]?.reason.includes("every"), "naming what does not check out");
  const listed = await connection.triggers();
  assert.deepEqual(listed.map(({ name, on }) => [name, on]), [["a", true], ["c", false], ["d", true]]);
  assert.equal(listed[0]?.next, ran.next, "a new prompt leaves the clock alone");
  assert.equal(listed[1]?.next, null);
  assert.deepEqual(listed[2]?.schedule, { every: "1s" });
  await assert.rejects(connection.trigger("b"), isRefusal);
  assert.ok((await connection.sessions()).some((session) => session.id === threadB), "what b did is still there to read");

  const allEnded = (detail: TriggerDetail): boolean => detail.occurrences.every((occurrence) => occurrence.ended !== null);
  const dSince = (await connection.trigger("d")).occurrences.length;
  await trigger(connection, "d", (found) => found.occurrences.length > dSince && allEnded(found), "d to run again");
  await eventually(async () => (await connection.attach(threadB)).view.status, (status) => !status.busy && status.queued.length === 0, {
    what: "b's session to be idle",
  });
  await trigger(connection, "c", allEnded, "c to be idle");

  const bInputs = inputsOf((await connection.attach(threadB)).view).length;
  const cRuns = (await connection.trigger("c")).occurrences.length;
  const dRuns = (await connection.trigger("d")).occurrences.length;
  const inputs = await eventually(
    async () => inputsOf((await connection.attach(threadA)).view),
    (found) => found.some((text) => text.includes("second prompt")),
    { what: "a to run with its new prompt" },
  );
  assert.ok(inputs[0]?.includes("first prompt"));
  await trigger(connection, "d", (found) => found.occurrences.length >= dRuns + 1, "d to go on");
  assert.equal(inputsOf((await connection.attach(threadB)).view).length, bInputs);
  assert.equal((await connection.trigger("c")).occurrences.length, cRuns);
});

test("a trigger switched off through the agent's contract stops, and switched on runs again, its file changed by the agent", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  writeFileSync(homePaths(home).config, JSON.stringify({ name: "scout" }));
  const rig = await startAgentRig(t, { home, scenario: "chat", shortestEveryMs: SHORTEST });
  const connection = await rig.connect();
  writeTrigger(home, "beat", ["every: 1s", `thread: ${rig.thread.id}`], "Beat.");
  await connection.reload();
  const file = join(homePaths(home).triggers, "beat.md");
  const allEnded = (detail: TriggerDetail): boolean => detail.occurrences.every((occurrence) => occurrence.ended !== null);
  await trigger(connection, "beat", (found) => found.occurrences.length >= 1, "beat to run");

  const off = await connection.switchTrigger("beat", false);
  assert.deepEqual([off.on, off.next], [false, null]);
  assert.equal(parseTrigger("beat", readFileSync(file, "utf8"), { shortestEveryMs: SHORTEST }).enabled, false);
  const runs = (await trigger(connection, "beat", allEnded, "what was under way to end")).occurrences.length;
  await delay(2_500);
  assert.equal((await connection.trigger("beat")).occurrences.length, runs, "nothing ran while it was off");

  const on = await connection.switchTrigger("beat", true);
  assert.equal(on.on, true);
  assert.notEqual(on.next, null);
  assert.equal(parseTrigger("beat", readFileSync(file, "utf8"), { shortestEveryMs: SHORTEST }).prompt, "Beat.", "the rest of the file is as it was");
  await trigger(connection, "beat", (found) => found.occurrences.length > runs, "beat to run again");

  await assert.rejects(connection.switchTrigger("nothing", false), isRefusal);
});

test("an agent killed while an occurrence's turn is underway comes back to it once: the occurrence happens once", { timeout: 60_000 }, async (t) => {
  useRuntimeDir(t);
  const home = tempDir(t, "agent");
  await startChatServer(t);
  const options = { shortestEveryMs: SHORTEST };
  const first = await startAgentChild(t, home, "gated", 400, options);
  const talk = await talkTo(t, SCOUT);
  writeTrigger(home, "tidy", ["every: 1s", `thread: ${talk.thread.id}`], "Tidy the notes.");
  const firstConn = await connectAgent(t, home);
  await firstConn.reload();
  await firstConn.close();
  await eventually(() => (existsSync(join(home, "requests.jsonl")) ? loggedRequests(home).length : 0), (asked) => asked >= 1, { what: "the occurrence's turn to begin" });
  await first.kill("SIGKILL");

  releaseGate(home);
  await startAgentChild(t, home, "gated", 400, options);
  const connection = await connectAgent(t, home);
  stopAfter(t, () => connection.close().catch(() => undefined));
  const detail = await trigger(connection, "tidy", (found) => ended(found, "answered") >= 1, "the occurrence to be answered");

  const oldest = detail.occurrences.at(-1);
  assert.equal(oldest?.ended, "answered");
  assert.equal(detail.occurrences.filter((occurrence) => occurrence.due === oldest.due).length, 1);
  const fired = localTime(oldest.firedAt);
  const inputs = inputsOf((await connection.attach(talk.thread.id)).view);
  assert.equal(inputs.filter((text) => text.includes(`fired at ${fired}`)).length, 1);
  const [sent, resent] = loggedRequests(home);
  assert.ok(sent && resent && sent.pid !== resent.pid && sent.digest === resent.digest, "the request was sent again by the next agent");
});

test("a stop ends the turn of the occurrence that is running, and the trigger stays on", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  const rig = await startAgentRig(t, { home, scenario: "mixed", tokensPerSecond: 40, shortestEveryMs: SHORTEST });
  const connection = await rig.connect();
  writeTrigger(home, "tidy", ["every: 1s", `thread: ${rig.thread.id}`], "stream a long answer");
  await connection.reload();
  await eventually(() => connection.sessions(), (found) => found.some((session) => session.id === rig.thread.id && session.working), { what: "the occurrence to be running" });
  const watched = await connection.attach(rig.thread.id);
  await waitForView(watched, (view) => view.items.some((item) => item.type === "assistant" && item.streaming));

  const stoppedAt = Date.now();
  await watched.stop();

  const stopped = await trigger(connection, "tidy", (found) => ended(found, "stopped") >= 1, "the occurrence to be stopped");
  assert.equal(stopped.on, true);
  assert.ok(stopped.next !== null, "and it still has a next time");
  const again = await trigger(
    connection,
    "tidy",
    (found) => found.occurrences.some((occurrence) => occurrence.firedAt > stoppedAt && occurrence.ended !== "skipped"),
    "the trigger to run again",
  );
  assert.ok(again.occurrences.length >= 2);
  assert.equal((await connection.sessions()).filter((session) => session.id === rig.thread.id).length, 1);
});
