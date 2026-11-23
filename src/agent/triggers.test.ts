import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fauxAssistantMessage, type Message } from "@earendil-works/pi-ai";
import type { Occurrence, TriggerDetail } from "../contracts/agent/index.ts";
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
  type Script,
  type SessionView,
  startAgentChild,
  startAgentRig,
  startChatServer,
  writeTrigger,
} from "./testing/index.ts";

/*
 * Standing triggers: the real engine under an agent, the real chat server, a
 * scripted model, and intervals of a second, which the tests allow by shortening
 * the shortest interval a trigger may have.
 */

const timeout = 40_000;
/** The shortest interval a trigger may have in these tests, in milliseconds. */
const SHORTEST = 200;

/** What a message of a person, an occurrence or a wake-up says. */
function textOf(message: Message | undefined): string {
  if (message?.role !== "user") return "";
  return typeof message.content === "string" ? message.content : message.content.map((block) => (block.type === "text" ? block.text : "")).join("");
}

/** The inputs a session was given, as the model read them, oldest first. */
const inputsOf = (view: SessionView): string[] => view.items.flatMap((item) => (item.type === "user" ? [item.text] : []));

const sentBy = (id: string, messages: { author: { id: string }; text: string }[]): string[] =>
  messages.filter((message) => message.author.id === id).map((message) => message.text);

/** A trigger's detail once `done` accepts it. */
const trigger = (connection: AgentConnection, name: string, done: (detail: TriggerDetail) => boolean, what: string) =>
  eventually(() => connection.trigger(name), done, { what, timeoutMs: 20_000 });

/** How many of a trigger's occurrences have ended in this way. */
const ended = (detail: TriggerDetail, how: Occurrence["ended"]): number => detail.occurrences.filter((occurrence) => occurrence.ended === how).length;

test("a trigger fires on its schedule into a session of its own, and what it writes last goes nowhere", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  writeTrigger(home, "tidy", ["every: 1s"], "Tidy the notes.");
  // The first occurrence tries every way of saying something, and asks to be woken. Later ones just answer.
  const model = callingTools(
    [
      [
        { name: "send_message", args: { text: "Nobody to tell." } },
        { name: "send_message", args: { text: "Tidied once.", to: `@${userInfo().username}` } },
        { name: "check_back", args: { in: "1s", note: "look at the notes again" } },
      ],
    ],
    "All tidy.",
  );
  const rig = await startAgentRig(t, { home, script: model.script, shortestEveryMs: SHORTEST, tokensPerSecond: 1_000_000 });
  const connection = await rig.connect();

  const detail = await trigger(connection, "tidy", (found) => ended(found, "answered") >= 2, "two occurrences to be answered");

  // One session of its own, behind no thread, named for the trigger.
  const own = (await connection.sessions()).filter((session) => session.id === "trigger:tidy");
  assert.deepEqual(own.map((session) => [session.threadId, session.channelId]), [[null, null]]);
  assert.equal(detail.session, "trigger:tidy");
  const watched = await connection.attach("trigger:tidy");
  const woken = await eventually(
    () => inputsOf(watched.view),
    (inputs) => inputs.some((text) => text.includes("look at the notes again")),
    { what: "the wake-up to come to the same session" },
  );
  assert.ok(woken.length >= 3, "the occurrences and the wake-up are in one history");
  const [first = "", second = ""] = woken;
  assert.ok(first.includes("tidy") && first.includes("Tidy the notes."), first);
  assert.ok(second.includes("tidy") && second.includes("Tidy the notes."), second);
  assert.ok(!first.includes("Thread th_"), "it is in no thread");

  // What it wrote last was posted nowhere, and send_message needed someone to tell.
  assert.deepEqual(sentBy(rig.partner.id, await rig.said()), ["Tidied once."]);
  const [nowhere, told, set] = model.answers;
  assert.equal(nowhere?.isError, true);
  assert.equal(told?.isError, false);
  assert.equal(set?.isError, false);
  assert.deepEqual(rig.reports, []);
});

test("firing a trigger now makes an occurrence, keeps the schedule, and runs nothing over", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  writeTrigger(home, "weekly", ["every: 1h"], "Write the weekly summary.");
  writeTrigger(home, "parked", ["every: 1h", "enabled: false"], "Never run on its own.");
  const rig = await startAgentRig(t, { home, scenario: "gated", shortestEveryMs: SHORTEST });
  const connection = await rig.connect();

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

test("a trigger with a thread runs in the session behind it, or fails its occurrence when it can't", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  // The occurrence is held until the test lets it go, to see the thread marked as working meanwhile.
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const script: Script = async (messages) => {
    const latest = textOf(messages.findLast((message) => message.role === "user"));
    // An occurrence, told by its trigger's prompt.
    if (["Tidy the notes.", "Write the report."].some((prompt) => latest.includes(prompt))) await gate;
    return fauxAssistantMessage(`Seen: ${latest}`);
  };
  const rig = await startAgentRig(t, { home, script, shortestEveryMs: SHORTEST });
  const connection = await rig.connect();
  await rig.receiptOn(await rig.say("hello"));
  // Nothing has been said in this thread of the same DM, so the agent has no session behind it.
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

  // A line in the thread says the trigger fired, and below it the final text is a reply like any other. The agent's
  // receipt on the line points to the reply.
  const said = await rig.said();
  const line = said.find((message) => message.trigger?.name === "tidy");
  assert.ok(line);
  assert.deepEqual([line.author.id, line.trigger?.prompt, line.trigger?.output], [rig.partner.id, "Tidy the notes.", null]);
  const reply = said.find((message) => message.seq > line.seq && message.author.id === rig.partner.id && message.trigger === null);
  for (const fact of [rig.thread.id, rig.thread.channelId, "tidy", "Tidy the notes."]) assert.ok(reply?.text.includes(fact), `${fact} in ${String(reply?.text)}`);
  assert.deepEqual(
    line.receipts.map((receipt) => [receipt.status, receipt.reply]),
    [["answered", reply?.id]],
  );
  // The session behind the thread is the one that took the message: one history.
  const { session } = await rig.attach();
  const inputs = inputsOf(session.view);
  assert.ok(inputs.some((text) => text.includes("hello")) && inputs.some((text) => text.includes("Tidy the notes.")));
  await rig.untilIdle();

  // The thread with no session behind it: the first occurrence asked chat which channel it is in, made the session there
  // and ran in it, and its final text is posted in that thread.
  await trigger(connection, "report", (found) => ended(found, "answered") >= 1, "the occurrence to make its session and be answered");
  const made = (await connection.sessions()).find((each) => each.id === side.id);
  assert.deepEqual([made?.threadId, made?.channelId], [side.id, rig.thread.channelId]);
  assert.deepEqual(
    made?.place,
    { kind: "dm", with: { name: rig.me.name, kind: "person" }, thread: { main: false, name: "Reports" } },
    "and it knows where that is, which the first occurrence asked chat",
  );
  const [first] = (await rig.replies(side.id)).map((reply) => reply.text);
  for (const fact of [side.id, rig.thread.channelId, "report", "Write the report."]) assert.ok(first?.includes(fact), `${fact} in ${String(first)}`);
  // A message in that thread goes to the same session, which the agent now has.
  const asked = await rig.say("and what else?", side.id);
  assert.equal((await rig.receiptOn(asked)).status, "answered");
  const inSide = inputsOf((await rig.attach(side.id)).session.view);
  assert.ok(inSide.some((text) => text.includes("Write the report.")) && inSide.some((text) => text.includes("and what else?")));

  // The other has nowhere to go. It is an occurrence all the same, failed, and the agent says so.
  const lost = await trigger(connection, "lost", (found) => ended(found, "failed") >= 1, "the occurrence with nowhere to go to fail");
  assert.notEqual(lost.occurrences[0]?.reason ?? null, null, "and says why");
  assert.ok(rig.reports.some((report) => (report as Error).message.includes("th_aaaaaaaaaaaa")), "and it was reported");
  assert.equal(lost.session, null);
  assert.ok(!(await connection.sessions()).some((each) => each.id.startsWith("trigger:")), "no session was made for either");
  assert.ok(!(await connection.sessions()).some((each) => each.id === "th_aaaaaaaaaaaa"));

  // With chat away the agent cannot look, and that is what the occurrence says.
  for (const name of ["tidy", "report", "lost"]) removeTrigger(home, name);
  await rig.chat.outage();
  writeTrigger(home, "away", ["every: 1s", "thread: th_bbbbbbbbbbbb"], "Nothing reaches it.");
  await connection.reload();
  const away = await trigger(connection, "away", (found) => ended(found, "failed") >= 1, "the occurrence to fail while chat is away");
  assert.notEqual(away.occurrences[0]?.reason ?? null, null, "and says why");
});

test("an agent down past several of a trigger's times runs it once when it starts, then keeps to its schedule", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  writeTrigger(home, "tidy", ["every: 1s"]);
  const first = await startAgentRig(t, { home, shortestEveryMs: SHORTEST, scenario: "chat" });
  const before = await first.connect();
  await eventually(async () => (await before.triggers())[0]?.next, (next) => typeof next === "number", { what: "the trigger to wait for its time" });
  await first.agent.close();
  // Two or three times pass while the agent is down.
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

test("an occurrence due while the last one still goes is skipped, or handed over behind it with overlap allowed", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  writeTrigger(home, "skips", ["every: 1s"]);
  writeTrigger(home, "queues", ["every: 1s", "overlap: allow"]);
  // The model holds every turn until the test lets it go, so the first occurrence of each is still going.
  const rig = await startAgentRig(t, { home, scenario: "gated", shortestEveryMs: SHORTEST });
  const connection = await rig.connect();

  const skips = await trigger(connection, "skips", (found) => ended(found, "skipped") >= 2, "occurrences to be skipped");
  const queues = await trigger(connection, "queues", (found) => ended(found, null) >= 3, "occurrences to wait behind the first");
  assert.equal(ended(skips, null), 1, "the first is going and the rest were skipped");
  assert.equal(ended(queues, "skipped"), 0, "none was skipped");
  const watched = await connection.attach("trigger:queues");
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
  writeTrigger(home, "a", ["every: 1h"], "first prompt");
  for (const name of ["b", "c", "d"]) writeTrigger(home, name, ["every: 1s"]);
  writeTrigger(home, "e", ["every: soon"]);
  writeTrigger(home, ".hidden", ["every: 1s"]);
  writeFileSync(join(homePaths(home).triggers, "notes.txt"), "not a trigger");
  const rig = await startAgentRig(t, { home, scenario: "chat", shortestEveryMs: SHORTEST });
  const connection = await rig.connect();

  // At the start the file that doesn't check out is left out and named, and the others are read.
  assert.equal(rig.reports.length, 1);
  assert.ok((rig.reports[0] as Error).message.includes("triggers/e.md"), "naming the file");
  assert.deepEqual((await connection.triggers()).map(({ name }) => name), ["a", "b", "c", "d"]);
  for (const name of ["b", "c", "d"]) await trigger(connection, name, (found) => found.occurrences.length >= 1, `${name} to run`);

  // A new schedule counts from now: an hour became two seconds, and the first occurrence comes at once.
  writeTrigger(home, "a", ["every: 2s"], "first prompt");
  assert.deepEqual((await connection.reload()).leftOut.map(({ file }) => file), ["triggers/e.md"]);
  const ran = await trigger(connection, "a", (found) => found.occurrences.length >= 1, "the new schedule to take effect");

  // A new prompt leaves the clock alone. A file that is gone, or turned off, ends its trigger, and one that doesn't
  // check out is named, with the trigger keeping what it had.
  writeTrigger(home, "a", ["every: 2s"], "second prompt");
  removeTrigger(home, "b");
  writeTrigger(home, "c", ["every: 1s", "enabled: false"]);
  writeTrigger(home, "d", ["every: soon"]);
  const answer = await connection.reload();

  assert.deepEqual(answer.leftOut.map(({ file }) => file), ["triggers/d.md", "triggers/e.md"]);
  assert.ok(answer.leftOut[0]?.reason.includes("every"), "naming what does not check out");
  const listed = await connection.triggers();
  assert.deepEqual(listed.map(({ name, on }) => [name, on]), [["a", true], ["c", false], ["d", true]]);
  assert.equal(listed[0]?.next, ran.next, "a new prompt leaves the clock alone");
  assert.equal(listed[1]?.next, null);
  assert.deepEqual(listed[2]?.schedule, { every: "1s" });
  await assert.rejects(connection.trigger("b"), isRefusal);
  assert.ok((await connection.sessions()).some((session) => session.id === "trigger:b"), "what b did is still there to read");

  // What was under way when the files changed ends first: d runs again after it, and b's session and c are idle.
  const allEnded = (detail: TriggerDetail): boolean => detail.occurrences.every((occurrence) => occurrence.ended !== null);
  const dSince = (await connection.trigger("d")).occurrences.length;
  await trigger(connection, "d", (found) => found.occurrences.length > dSince && allEnded(found), "d to run again");
  await eventually(async () => (await connection.attach("trigger:b")).view.status, (status) => !status.busy && status.queued.length === 0, {
    what: "b's session to be idle",
  });
  await trigger(connection, "c", allEnded, "c to be idle");

  // From then on d goes on and a runs with its new prompt, while b and c do not run.
  const bInputs = inputsOf((await connection.attach("trigger:b")).view).length;
  const cRuns = (await connection.trigger("c")).occurrences.length;
  const dRuns = (await connection.trigger("d")).occurrences.length;
  const inputs = await eventually(
    async () => inputsOf((await connection.attach("trigger:a")).view),
    (found) => found.some((text) => text.includes("second prompt")),
    { what: "a to run with its new prompt" },
  );
  assert.ok(inputs[0]?.includes("first prompt"));
  await trigger(connection, "d", (found) => found.occurrences.length >= dRuns + 1, "d to go on");
  assert.equal(inputsOf((await connection.attach("trigger:b")).view).length, bInputs);
  assert.equal((await connection.trigger("c")).occurrences.length, cRuns);
});

test("an agent killed while an occurrence's turn is underway comes back to it once: the occurrence happens once", { timeout: 60_000 }, async (t) => {
  useRuntimeDir(t);
  const home = tempDir(t, "agent");
  await startChatServer(t);
  writeTrigger(home, "tidy", ["every: 1s"], "Tidy the notes.");
  const options = { shortestEveryMs: SHORTEST };
  // The model holds the turn until it is let go, so the kill falls in the middle of it.
  const first = await startAgentChild(t, home, "gated", 400, options);
  await eventually(() => (existsSync(join(home, "requests.jsonl")) ? loggedRequests(home).length : 0), (asked) => asked >= 1, { what: "the occurrence's turn to begin" });
  await first.kill("SIGKILL");

  releaseGate(home);
  await startAgentChild(t, home, "gated", 400, options);
  const connection = await connectAgent(t, home);
  stopAfter(t, () => connection.close().catch(() => undefined));
  const detail = await trigger(connection, "tidy", (found) => ended(found, "answered") >= 1, "the occurrence to be answered");

  // The first occurrence is the oldest. It is on record once, was handed to its session once, and reached the model
  // twice, which is what a kill in the middle of a request costs.
  const oldest = detail.occurrences.at(-1);
  assert.equal(oldest?.ended, "answered");
  assert.equal(detail.occurrences.filter((occurrence) => occurrence.due === oldest.due).length, 1);
  const fired = localTime(oldest.firedAt);
  const inputs = inputsOf((await connection.attach("trigger:tidy")).view);
  assert.equal(inputs.filter((text) => text.includes(`fired at ${fired}`)).length, 1);
  const [sent, resent] = loggedRequests(home);
  assert.ok(sent && resent && sent.pid !== resent.pid && sent.digest === resent.digest, "the request was sent again by the next agent");
});

test("a stop ends the turn of the occurrence that is running, and the trigger stays on", { timeout }, async (t) => {
  const home = tempDir(t, "agent");
  writeTrigger(home, "tidy", ["every: 1s"], "stream a long answer");
  const rig = await startAgentRig(t, { home, scenario: "mixed", tokensPerSecond: 40, shortestEveryMs: SHORTEST });
  const connection = await rig.connect();
  await eventually(() => connection.sessions(), (found) => found.some((session) => session.id === "trigger:tidy" && session.working), { what: "the occurrence to be running" });
  const watched = await connection.attach("trigger:tidy");
  await waitForView(watched, (view) => view.items.some((item) => item.type === "assistant" && item.streaming));

  const stoppedAt = Date.now();
  await watched.stop();

  const stopped = await trigger(connection, "tidy", (found) => ended(found, "stopped") >= 1, "the occurrence to be stopped");
  assert.equal(stopped.on, true);
  assert.ok(stopped.next !== null, "and it still has a next time");
  // The next time that falls due runs it again, in the same session.
  const again = await trigger(
    connection,
    "tidy",
    (found) => found.occurrences.some((occurrence) => occurrence.firedAt > stoppedAt && occurrence.ended !== "skipped"),
    "the trigger to run again",
  );
  assert.ok(again.occurrences.length >= 2);
  assert.equal((await connection.sessions()).filter((session) => session.id === "trigger:tidy").length, 1);
});
