import type { SessionActivity, ToolStatus } from "../../../contracts/agent/index.ts";
import type { Receipt } from "../../../contracts/chat/index.ts";
import { SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import type { Problem, Why } from "../network/index.ts";
import type { Notice } from "../state/index.ts";
import { oneLine } from "./plain.ts";

/*
 * Every sentence the console says, in one place. They are plain and short, in
 * the voice of the commands: what happened, and what to do next. Where the
 * commands already say it, the console says it the same way. A name, an ID or
 * a message that came from another program is put on one line and made
 * harmless here, whoever calls, so no sentence can carry anything else.
 */

/** The command that starts everything a conversation needs, as the commands name it. */
const START_EVERYTHING = "shrimpy up <home>... --data <dir>";

/** The program a problem is about. */
export type Program = { kind: "chat" } | { kind: "agent"; name: string };

const CHAT = "the chat server";

/** What to tell about the gateway, if it is not as it should be. */
export function gatewayNote(why: Why): string | undefined {
  switch (why.kind) {
    case "not-running":
      return `No gateway is running on this machine. Start Shrimpy with: ${START_EVERYTHING}`;
    case "lost":
      return "Lost the connection to the gateway. The list of agents may be out of date. Trying again.";
    case "unreachable":
      return `Could not reach the gateway: ${oneLine(why.message)}`;
    case "connecting":
    case "not-registered":
      return undefined;
  }
}

/** What to tell about the chat server, if it is not as it should be. */
export function chatNote(why: Why): string | undefined {
  switch (why.kind) {
    case "not-registered":
      return `No chat server is registered with this machine's gateway. Start one with: shrimpy chat serve <data-dir>, or start everything with: ${START_EVERYTHING}`;
    case "lost":
      return "Lost the connection to the chat server. What is shown may be out of date, and nothing can be sent. Trying again.";
    case "unreachable":
      return oneLine(why.message);
    case "connecting":
    case "not-running":
      return undefined;
  }
}

/** What to tell about the agent that is selected, if it is not as it should be. */
export function agentNote(agent: string, why: Why): string | undefined {
  const name = oneLine(agent);
  switch (why.kind) {
    case "not-registered":
      return `No agent named ${name} is registered with this machine's gateway. Start it with: shrimpy agent serve <home>, or start everything with: ${START_EVERYTHING}`;
    case "lost":
      return `Lost the connection to ${name}. The work shown may be out of date, and it can't be stopped from here. Trying again.`;
    case "unreachable":
      return oneLine(why.message);
    case "connecting":
    case "not-running":
      return undefined;
  }
}

/** A program runs another version of Shrimpy than the console does. */
export function versionWarning(what: string, version: string): string | undefined {
  if (version === SHRIMPY_VERSION) return undefined;
  return `Warning: ${oneLine(what)} runs Shrimpy ${oneLine(version)}, but this console is ${SHRIMPY_VERSION}. Programs are meant to be upgraded together.`;
}

/** Why something could not be done, as the end of a sentence. */
function because(program: Program, problem: Problem): string {
  const who = program.kind === "chat" ? CHAT : oneLine(program.name);
  if ("said" in problem) return oneLine(problem.said).replace(/\.$/, "");
  switch (problem.down.kind) {
    case "connecting":
      return `not connected to ${who} yet`;
    case "lost":
      return `lost the connection to ${who}`;
    case "not-registered":
      return program.kind === "chat" ? "no chat server is registered" : `${who} is not registered with the gateway`;
    case "not-running":
      return "no gateway is running";
    case "unreachable":
      return oneLine(problem.down.message).replace(/\.$/, "");
  }
}

/** What a notice says. `agent` is the agent the person is talking to. */
export function noticeText(notice: Notice, agentName: string): string {
  const agent = oneLine(agentName);
  switch (notice.kind) {
    case "not-sent":
      return `Not sent: ${because({ kind: "chat" }, notice.problem)}. Your message is still in the editor.`;
    case "not-opened":
      return `Could not open the thread: ${because({ kind: "chat" }, notice.problem)}.`;
    case "not-watched":
      return `Could not watch the work: ${because({ kind: "agent", name: agent }, notice.problem)}.`;
    case "not-listed":
      return `Could not read your threads: ${because({ kind: "chat" }, notice.problem)}.`;
    case "stopped":
      return `Stopped ${agent}'s work in this thread.`;
    case "nothing-to-stop":
      return `Nothing to stop: ${agent} is not working in this thread.`;
    case "not-stopped":
      return `Could not stop the work: ${because({ kind: "agent", name: agent }, notice.problem)}.`;
  }
}

/** The line printed when the console is left while an agent is still working. */
export function farewellLine(agentName: string, threadId: string): string {
  const agent = oneLine(agentName);
  const thread = oneLine(threadId);
  return (
    `${agent} is still working in thread ${thread}, and the work continues. ` +
    `To stop it, open the thread and press Esc, or run: shrimpy sessions stop <home> ${thread}`
  );
}

export const AGENTS_EMPTY = `No agent is registered with this machine's gateway. Start one with: shrimpy agent serve <home>, or start everything with: ${START_EVERYTHING}`;
export const THREAD_EMPTY = "No messages yet.";
export const NO_TITLE = "(no messages yet)";

export const agentsTitle = (): string => "Agents";
export const threadsTitle = (agent: string): string => `${oneLine(agent)} · your threads`;
export const threadTitle = (agent: string, title: string | undefined): string =>
  `${oneLine(agent)} · ${title === undefined ? "new thread" : oneLine(title)}`;
export const threadsEmpty = (agent: string): string =>
  `You have not talked to ${oneLine(agent)} yet. Press n to start a thread.`;
export const newThreadHint = (agent: string): string => `New thread with ${oneLine(agent)}. Type below to start it.`;
export const earlierMessages = (count: number, threadId: string): string =>
  `${String(count)} earlier ${count === 1 ? "message is" : "messages are"} not shown. Read them with: shrimpy read ${oneLine(threadId)}`;

/** A line under a message when its receipt says something a person needs to know, and nothing for one that doesn't. */
export function receiptNote(receipt: Receipt, name: string): string | undefined {
  const who = oneLine(name);
  switch (receipt.status) {
    case "answered":
    case "silent":
      return undefined;
    case "failed":
      return `${who} failed: ${oneLine(receipt.detail ?? "")}`;
    case "stopped":
      return `${who} stopped before answering`;
    case "skipped":
      return `${who} skipped this message`;
  }
}

/** Who is working in a thread, and what the session is doing. At least one name. */
export function workingLine(names: string[], activity: SessionActivity | undefined): string {
  const who = names.map(oneLine).join(" and ");
  const verb = names.length > 1 ? "are" : "is";
  const doing = activity === undefined ? undefined : activityWords(activity);
  return `${who} ${verb} working${doing === undefined ? "" : ` · ${doing}`} · esc to stop`;
}

function activityWords(activity: SessionActivity): string | undefined {
  switch (activity.kind) {
    case "idle":
    case "working":
      return undefined;
    case "answering":
      return "answering";
    case "tool":
      return `running ${oneLine(activity.name)}`;
    case "retrying":
      return `retrying after: ${oneLine(activity.error)}`;
  }
}

/** What marks a title or a block that may no longer be current. */
export const OUT_OF_DATE = "out of date";
export const THINKING = "thinking";
export const hiddenSteps = (count: number): string =>
  `${String(count)} earlier ${count === 1 ? "step" : "steps"} not shown`;
export const hiddenLines = (count: number): string =>
  `${String(count)} earlier ${count === 1 ? "line" : "lines"}`;

/** How a tool call stands, with a mark, and how to draw it. */
export function toolStatus(status: ToolStatus): { label: string; tone: "good" | "bad" | "busy" | "idle" } {
  switch (status) {
    case "pending":
      return { label: "○ waiting", tone: "idle" };
    case "running":
      return { label: "● running", tone: "busy" };
    case "done":
      return { label: "✓ done", tone: "good" };
    case "error":
      return { label: "✗ failed", tone: "bad" };
    case "interrupted":
      return { label: "! interrupted, not run again", tone: "bad" };
  }
}

/** A word on an answer that did not end the way an answer does. */
export function answerNote(stopReason: string | null): string | undefined {
  if (stopReason === "aborted") return "answer interrupted";
  if (stopReason === "error") return "answer failed";
  return undefined;
}

export const KEYS = {
  agents: "↑↓ choose · enter open · ctrl+c twice to quit",
  threads: "↑↓ choose · enter open · n new thread · esc agents · ctrl+c twice to quit",
  thread: "enter send · esc stop · ctrl+t threads · ctrl+n new · ctrl+c clear, then quit",
};
export const QUIT_AGAIN = "Press Ctrl+C again to quit.";
