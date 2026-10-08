import type {
  QueuedInput,
  SessionActivity,
  SessionItem,
  SessionPlace,
  ThreadPlace,
  ToolStatus,
} from "../../../contracts/agent/index.ts";
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
const START_EVERYTHING = "shrimpy up";

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

/**
 * What to tell about the agent that is selected, if it is not as it should be.
 * `looking` is what is on show: the work in a thread, or the agent's sessions.
 * `home` says whether this machine has a home for the agent, when the console
 * was told: an agent that has none lives somewhere else, and is started there.
 */
export function agentNote(
  agent: string,
  why: Why,
  looking: "work" | "sessions" = "work",
  home?: { found: boolean; where: string },
): string | undefined {
  const name = oneLine(agent);
  switch (why.kind) {
    case "not-registered":
      return home?.found === false
        ? `No agent named ${name} is registered with this machine's gateway. It has no home in ${oneLine(home.where)}, so it lives somewhere else: start it where it lives.`
        : `No agent named ${name} is registered with this machine's gateway. Start it with: shrimpy agent serve ${name}, or start everything with: ${START_EVERYTHING}`;
    case "lost":
      return looking === "work"
        ? `Lost the connection to ${name}. The work shown may be out of date. Trying again.`
        : `Lost the connection to ${name}. What is shown may be out of date. Trying again.`;
    case "unreachable":
      return oneLine(why.message);
    case "connecting":
    case "not-running":
      return undefined;
  }
}

/** What the agent said when it would not list its sessions, or would not let one be watched. */
export function refusalNote(looking: "sessions" | "session", agent: string, said: string): string {
  const reason = because({ kind: "agent", name: agent }, { said });
  return looking === "sessions" ? `Could not list the sessions of ${oneLine(agent)}: ${reason}.` : `Could not watch the session: ${reason}.`;
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
  }
}

/** The line printed when the console is left while an agent is still working. */
export function farewellLine(agentName: string, threadId: string): string {
  const agent = oneLine(agentName);
  const thread = oneLine(threadId);
  return (
    `${agent} is still working in thread ${thread}, and the work continues. ` +
    `To stop it, open the thread and write /stop, or run: shrimpy sessions stop ${thread} --agent ${agent}`
  );
}

export const AGENTS_EMPTY = `No agent has joined this machine's roster yet. Start one with: shrimpy agent serve <agent>, or start everything with: ${START_EVERYTHING}`;
export const THREAD_EMPTY = "No messages yet.";
export const NO_TITLE = "(no messages yet)";
export const DELETED = "This message was deleted.";

/** What marks a message that was edited, with when. */
export const editedAt = (when: string): string => `edited ${when}`;

/** The emoji on a message and who put each there, on one line, or nothing when there are none. */
export function reactionsLine(reactions: { emoji: string; by: string[] }[]): string | undefined {
  if (reactions.length === 0) return undefined;
  return reactions.map(({ emoji, by }) => `${oneLine(emoji)} ${by.join(", ")}`).join("  ");
}

export const agentsTitle = (): string => "Agents and rooms";
export const threadsTitle = (agent: string): string => `${oneLine(agent)} · your threads`;
export const sessionsTitle = (agent: string): string => `${oneLine(agent)} · its sessions`;
export const roomThreadsTitle = (room: string): string => `${roomLabel(room)} · threads`;
/** `where` is where the session is, as `placeWords` says. */
export const sessionTitle = (agent: string, where: string): string => `${oneLine(agent)} · watching ${oneLine(where)}`;
export const sessionsEmpty = (agent: string): string => `${oneLine(agent)} has no sessions yet.`;
export const SESSION_EMPTY = "Nothing in this session yet.";
/** The label over what a session was shown. */
export const SHOWN = "shown";
export const idleLine = (agent: string): string => `${oneLine(agent)} is idle`;
/** `who` is what the conversation is called: an agent's name or a room's label. */
export const threadTitle = (who: string, title: string | undefined): string =>
  `${oneLine(who)} · ${title === undefined ? "new thread" : oneLine(title)}`;
export const threadsEmpty = (agent: string): string =>
  `You have not talked to ${oneLine(agent)} yet. Press Ctrl+N to start a thread.`;
export const newThreadHint = (agent: string): string => `New thread with ${oneLine(agent)}. Type below to start it.`;
export const newRoomThreadHint = (room: string): string => `New thread in ${roomLabel(room)}. Type below to start it.`;

/** A room as it is written wherever the console names one. */
export const roomLabel = (name: string): string => `#${oneLine(name)}`;
export const earlierMessages = (count: number, threadId: string): string =>
  `${String(count)} earlier ${count === 1 ? "message is" : "messages are"} not shown. Read them with: shrimpy read ${oneLine(threadId)}`;
export const earlierItems = (count: number, address: string, agent: string): string =>
  `${String(count)} earlier ${count === 1 ? "item is" : "items are"} not shown. Read them with: shrimpy sessions read ${oneLine(address)} --agent ${oneLine(agent)}`;

/**
 * Where a session is, as a list says it, in the names the agent gave: `me` is
 * the name of the person who is looking, whose DM with the agent is "your DM".
 * With no place, which is how an agent lists a session it has not learned the
 * place of, it is the session's address.
 */
export function placeWords(place: SessionPlace | null, address: string, me: string | undefined): string {
  if (place === null) return oneLine(address);
  switch (place.kind) {
    case "dm": {
      const mine = place.with.kind === "person" && place.with.name === me;
      return `${mine ? "your DM" : `DM with ${oneLine(place.with.name)}`} · ${threadWords(place.thread, address)}`;
    }
    case "room":
      return `${roomLabel(place.room)} · ${threadWords(place.thread, address)}`;
    case "trigger":
      return `trigger ${oneLine(place.trigger)}`;
  }
}

/** A thread of a session's place by its name, with a mark if it is the main one, or by its address when it has no name. */
function threadWords(thread: ThreadPlace, address: string): string {
  const name = thread.name === null ? "" : oneLine(thread.name);
  if (name !== "") return thread.main ? `${name} [main]` : name;
  return thread.main ? "main" : `thread ${oneLine(address)}`;
}

/** What marks where a session was reset or compacted. */
export const markerWords = (marker: Extract<SessionItem, { type: "marker" }>["marker"]): string =>
  marker === "reset" ? "session reset" : "session compacted";

const QUEUED_CHARACTERS = 200;

/** Input a session has accepted and not picked up yet, on one line. */
export function queuedLine(input: QueuedInput): string {
  const text = oneLine(input.text.slice(0, QUEUED_CHARACTERS * 4)).slice(0, QUEUED_CHARACTERS);
  return `queued (${input.mode === "followUp" ? "follow-up" : input.mode}): ${text}`;
}

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

/**
 * Who is working, and what the session is doing. At least one name. `inThread`
 * says that the person can write in the place this is shown, where `/stop` is
 * how to stop the work, which they can't in a session they are only watching.
 */
export function workingLine(names: string[], activity: SessionActivity | undefined, inThread: boolean): string {
  const who = names.map(oneLine).join(" and ");
  const verb = names.length > 1 ? "are" : "is";
  const doing = activity === undefined ? undefined : activityWords(activity);
  return `${who} ${verb} working${doing === undefined ? "" : ` · ${doing}`}${inThread ? " · write /stop to stop" : ""}`;
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
/** What is left out of the start of something shown in full, when it was longer than the limit. */
export const hiddenCharacters = (count: number): string =>
  `${String(count)} earlier ${count === 1 ? "character" : "characters"} not shown`;
/** What is left out of the end of something shown in full, when it was longer than the limit. */
export const moreCharacters = (count: number): string =>
  `${String(count)} more ${count === 1 ? "character" : "characters"} not shown`;

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

/** What the person asked to see in full. What is not is brief. */
export interface InFull {
  toolCalls: boolean;
  thinking: boolean;
}

/** What the keys that depend on the screen do on it. The line of keys is made from this, so it names what they do. */
export interface Can {
  /** Esc goes back a level. It does nothing on the first screen. */
  back: boolean;
  /** Ctrl+N starts a thread. */
  newThread: boolean;
  /** Tab switches between the person's threads with an agent and its sessions. */
  switchLists: boolean;
  /** Ctrl+O and Ctrl+T switch tool calls and thinking between brief and in full: work is shown here. */
  work: boolean;
}

/**
 * What the line of keys at the bottom of a screen says: every key that does
 * something there, each with what it does. Where Tab goes depends on which of
 * an agent's two lists is on show.
 */
export function keyHints(screen: "agents" | "threads" | "sessions" | "thread" | "session", can: Can, inFull: InFull): string[] {
  const hints: string[] = [];
  if (screen === "thread") hints.push("enter send");
  else if (screen === "sessions") hints.push("↑↓ choose", "enter watch");
  else if (screen !== "session") hints.push("↑↓ choose", "enter open");
  if (can.newThread) hints.push("ctrl+n new thread");
  if (can.switchLists) hints.push(screen === "sessions" ? "tab your threads" : "tab sessions");
  if (can.back) hints.push("esc back");
  if (can.work) {
    hints.push(`ctrl+o tool calls: ${inFull.toolCalls ? "full" : "brief"}`, `ctrl+t thinking: ${inFull.thinking ? "full" : "brief"}`);
  }
  hints.push("ctrl+d quit", screen === "thread" ? "ctrl+c clear, then quit" : "ctrl+c twice to quit");
  return hints;
}
export const QUIT_AGAIN = "Press Ctrl+C again to quit.";
