import {
  activityWords,
  type AnswerEnding,
  endingWords,
  failureWords,
  type ModelId,
  modelWords,
  placeLabel,
  placeWords as placeWithThread,
  type QueuedInput,
  type SessionActivity,
  type SessionPlace,
  type SessionSummary,
  type ToolStatus,
  toolStatusWords,
  usageWords,
  type WaitingWakeup,
  wakeupWords,
} from "../../../contracts/agent/index.ts";
import { AGENT_COMMANDS, type AgentCommand, type Channel, roomLabel } from "../../../contracts/chat/index.ts";
import { versionWarning } from "../../../contracts/gateway/index.ts";
import { oneLine } from "../../../lib/plain/index.ts";
import { listed, shellWord, withoutPeriod } from "../../../lib/text/index.ts";
import { localTime } from "../../../lib/time/index.ts";
import { SHRIMPY_RELEASE_NAME, SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import type { Problem, Why } from "../network/index.ts";
import type { AgentStatus, DevicesStatus, Notice, RoomStatus } from "../state/index.ts";
import { shortLine } from "./cut.ts";

/*
 * Every sentence the console says, in one place, but for what it says of a
 * session, a receipt, what a thread or a channel is called and a program of
 * another version, which it takes from the contracts as the commands do, and
 * frames here. They are plain and short, in the voice of the commands:
 * what happened, and what to do next. Where the commands already say it, the
 * console says it the same way. A name, an ID or a message that came from
 * another program is put on one line and made harmless here, whoever calls,
 * so no sentence can carry anything else.
 */

/** The command that starts everything a conversation needs, as the commands name it. */
const START_EVERYTHING = "shrimpy up";

/** The command a person writes in a thread to stop the work there. */
const STOP: AgentCommand = "stop";

/** The command a person writes in a thread to see or change the model of the thread's session. */
const MODEL: AgentCommand = "model";

/** How a device is taken back, as the person writes it. */
const TAKE_BACK = "/devices take back <device>";

/** What `/model` is written with to have the thread follow the agent's model again. */
export const MODEL_DEFAULT = "default";

/** The program a problem is about. */
export type Program = { kind: "chat" } | { kind: "gateway" } | { kind: "agent"; name: string };

const CHAT = "the chat server";

/** What to tell about the gateway, if it is not as it should be. */
export function gatewayNote(why: Why): string | undefined {
  switch (why.kind) {
    case "not-running":
      return `No gateway is running on this machine. Start Shrimpy with: ${START_EVERYTHING}`;
    case "refused":
      return `The gateway turned this terminal away: ${oneLine(why.words)}`;
    case "unproven":
      return oneLine(why.words);
    case "lost":
      return "Lost the connection to the gateway. The list of agents may be out of date. Trying again.";
    case "unreachable":
      return `Could not reach the gateway: ${oneLine(why.message)}`;
    case "connecting":
    case "not-linked":
      return undefined;
  }
}

/** What to tell about the chat server, if it is not as it should be. */
export function chatNote(why: Why): string | undefined {
  switch (why.kind) {
    case "not-linked":
      return `No chat server is linked to this machine's gateway. Start one with: shrimpy chat serve <data-dir>, or start everything with: ${START_EVERYTHING}`;
    case "lost":
      return "Lost the connection to the chat server. What is shown may be out of date, and nothing can be sent. Trying again.";
    case "unreachable":
      return oneLine(why.message);
    case "connecting":
    case "not-running":
    case "refused":
    case "unproven":
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
    case "not-linked":
      return home?.found === false
        ? `No agent named ${name} is linked to this machine's gateway. It has no home in ${oneLine(home.where)}, so it lives somewhere else: start it where it lives.`
        : `No agent named ${name} is linked to this machine's gateway. Start it with: shrimpy agent serve ${name}, or start everything with: ${START_EVERYTHING}`;
    case "lost":
      return looking === "work"
        ? `Lost the connection to ${name}. The work shown may be out of date. Trying again.`
        : `Lost the connection to ${name}. What is shown may be out of date. Trying again.`;
    case "unreachable":
      return oneLine(why.message);
    case "connecting":
    case "not-running":
    case "refused":
    case "unproven":
      return undefined;
  }
}

/** What the agent said when it would not list its sessions, or would not let one be watched. */
export function refusalNote(looking: "sessions" | "session", agent: string, said: string): string {
  const reason = because({ kind: "agent", name: agent }, { said });
  return looking === "sessions" ? `Could not list the sessions of ${oneLine(agent)}: ${reason}.` : `Could not watch the session: ${reason}.`;
}

/** A program runs another version of Shrimpy than the console does. */
export const versionNote = (what: string, version: string): string | undefined => versionWarning(what, version, "this console");

/** Why something could not be done, as the end of a sentence. */
function because(program: Program, problem: Problem): string {
  const who = program.kind === "chat" ? CHAT : program.kind === "gateway" ? "the gateway" : oneLine(program.name);
  if ("said" in problem) return withoutPeriod(oneLine(problem.said));
  switch (problem.down.kind) {
    case "connecting":
      return `not connected to ${who} yet`;
    case "lost":
      return `lost the connection to ${who}`;
    case "not-linked":
      return program.kind === "chat" ? "no chat server is linked to the gateway" : `${who} is not linked to the gateway`;
    case "not-running":
      return "no gateway is running";
    case "refused":
      return `the gateway turned this terminal away: ${withoutPeriod(oneLine(problem.down.words))}`;
    case "unproven":
      return withoutPeriod(oneLine(problem.down.words));
    case "unreachable":
      return withoutPeriod(oneLine(problem.down.message));
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
    case "no-command":
      return (
        `${oneLine(notice.written)} is no command here. The commands are ${listed(notice.commands.map(oneLine))}. ` +
        "To start a message with a slash, wrap it in backticks or put anything before it. Nothing was posted."
      );
    case "takes-nothing":
      return `${oneLine(notice.command)} takes nothing after it. Nothing was posted.`;
    case "model-is":
      return modelIs(agent, notice);
    case "model-unstarted": {
      const home = notice.defaultModel === undefined ? "" : ` Its default model is ${modelWords(notice.defaultModel)}.`;
      return `${agent} has no session in this thread yet.${home} To start the thread on a model, write /${MODEL} and that model.`;
    }
    case "model-not-shown":
      return `Could not read the model of this thread: ${because({ kind: "agent", name: agent }, notice.problem)}.`;
    case "name-an-agent":
      return `Nothing was posted. ${oneLine(AGENT_COMMANDS[notice.command].room)}`;
    case "devices-usage":
      return `${oneLine(notice.command)} lists your devices, and ${TAKE_BACK} takes one back. Nothing was taken back.`;
    case "taken-back":
      return `Took back ${oneLine(notice.device)}. Its link to the gateway has ended, and it can't link again until it joins anew.`;
    case "no-device":
      return notice.devices.length === 0
        ? `You have no devices, so none is called ${oneLine(notice.written)}.`
        : `No device of yours is called ${oneLine(notice.written)}. Your devices are ${listed(notice.devices.map(oneLine))}.`;
    case "devices-alike":
      return `More than one device of yours is called ${oneLine(notice.written)}. Name one by its ID, which /devices lists.`;
    case "not-taken-back":
      return `Could not take the device back: ${because({ kind: "gateway" }, notice.problem)}.`;
  }
}

/** What `/model` with nothing after it says: the model the thread uses, whose it is, and how to choose another. */
function modelIs(agent: string, notice: Extract<Notice, { kind: "model-is" }>): string {
  const choose = `/${MODEL} and a space`;
  if (notice.model === null) return `This thread has no model yet. To choose one, write ${choose}.`;
  const used = modelWords(notice.model);
  if (!notice.own) return `This thread uses ${used}, ${agent}'s default model. To choose another, write ${choose}.`;
  const home = notice.defaultModel === undefined ? "" : ` ${agent}'s default is ${modelWords(notice.defaultModel)}.`;
  return `This thread uses ${used}, a model chosen for this thread.${home} Write /${MODEL} ${MODEL_DEFAULT} to follow ${agent}'s model again, or ${choose} to choose another.`;
}

/** The line printed when the console is left while an agent is still working. */
export function farewellLine(agentName: string, threadId: string): string {
  const agent = oneLine(agentName);
  const thread = oneLine(threadId);
  return (
    `${agent} is still working in thread ${thread}, and the work continues. ` +
    `To stop it, open the thread and write /${STOP}, or run: shrimpy sessions stop ${thread} --agent ${agent}`
  );
}

export const AGENTS_EMPTY = `No agent has joined this machine's roster yet. Start one with: shrimpy agent serve <agent>, or start everything with: ${START_EVERYTHING}`;
export const THREAD_EMPTY = "No messages yet.";
export const DELETED = "This message was deleted.";

/** What marks a message that was edited, with when. */
export const editedAt = (when: string): string => `edited ${when}`;

/** The emoji on a message and who put each there, on one line, or nothing when there are none. */
export function reactionsLine(reactions: { emoji: string; by: string[] }[]): string | undefined {
  if (reactions.length === 0) return undefined;
  return reactions.map(({ emoji, by }) => `${oneLine(emoji)} ${by.join(", ")}`).join("  ");
}

export const agentsTitle = (): string => `shrimpy · ${SHRIMPY_VERSION} · ${SHRIMPY_RELEASE_NAME}`;

/** What the list on an agent's screen shows: everything the agent takes part in, or only what is with the person. */
export type ListFilter = "everything" | "yours";

/** The title of an agent's screen, which says which of the two the list shows. */
export const agentTitle = (agent: string, filter: ListFilter): string =>
  `${oneLine(agent)} · ${filter === "everything" ? "everything" : "your threads"}`;
/** `channel` is what the channel is called, as the chat contract's `channelLabel` says. */
export const channelThreadsTitle = (channel: string): string => `${oneLine(channel)} · threads`;
/** `where` is what is watched: where the session is, as `placeWords` says, or the thread it is behind. */
export const sessionTitle = (agent: string, where: string): string => `${oneLine(agent)} · watching ${oneLine(where)}`;
export const SESSION_EMPTY = "Nothing in this session yet.";
/** The label over what a session was shown. */
export const SHOWN = "shown";
export const idleLine = (agent: string): string => `${oneLine(agent)} is idle`;
/** `who` is what the conversation is called: an agent's name or a room's label. */
export const threadTitle = (who: string, title: string | undefined): string =>
  `${oneLine(who)} · ${title === undefined ? "new thread" : oneLine(title)}`;
/** What an agent's screen says when its list is empty. `more` is whether there is anything else on the other side of the filter. */
export const threadsEmpty = (agent: string, more: boolean): string =>
  `You have not talked to ${oneLine(agent)} yet. Press Ctrl+N to start a thread.${more ? ` Left shows everything ${oneLine(agent)} takes part in.` : ""}`;
export const newThreadHint = (agent: string): string => `New thread with ${oneLine(agent)}. Type below to start it.`;
export const newRoomThreadHint = (room: string): string => `New thread in ${roomLabel(room)}. Type below to start it.`;

/** The word on a row of the first screen for a room that the person is not in and only reads. */
export const READ_ONLY_TAG = "read-only";

/** The names of a channel's members, in alphabetical order, each on one line. */
const memberNames = (channel: Pick<Channel, "members">): string[] =>
  channel.members.map((member) => oneLine(member.name)).sort((a, b) => a.localeCompare(b));

/**
 * What the first screen says of a room the person only reads: that it is only
 * read, which comes first so that a narrow terminal does not cut it, then its
 * members, and whether anyone is working in it.
 */
export function readOnlyDetail(room: Pick<Channel, "members">, working: boolean): string {
  return [READ_ONLY_TAG, memberNames(room).join(", "), working ? "working" : ""].filter((part) => part !== "").join(" · ");
}

/** A room's name as the command that joins it takes it, in quotes since a shell reads a bare `#` as the start of a comment. */
function roomWord(name: string): string {
  const written = `#${oneLine(name)}`;
  return /^[^"$`\\!]*$/.test(written) ? `"${written}"` : shellWord(written);
}

/**
 * The line that stands where the input would be in a thread of a channel the
 * person only reads: that they only read it, and, for a room, how to join it,
 * with their own name, `me`, as the command takes it. A DM has two members and
 * takes no more, so there is no way to join it.
 */
export function readOnlyLine(channel: Pick<Channel, "kind" | "name" | "members">, me: string | undefined): string {
  if (channel.kind === "dm") {
    return `You are only reading this DM. It has two members, ${listed(memberNames(channel))}, and takes no more.`;
  }
  const you = me === undefined ? "<your name>" : shellWord(oneLine(me));
  return `You are only reading ${roomLabel(channel.name)}. To join it, run: shrimpy rooms add ${roomWord(channel.name)} ${you}`;
}

export const earlierMessages = (count: number, threadId: string): string =>
  `${String(count)} earlier ${count === 1 ? "message is" : "messages are"} not shown. Read them with: shrimpy read ${oneLine(threadId)}`;
export const earlierItems = (address: string, agent: string): string =>
  `Earlier items are not shown. Read the whole session with: shrimpy sessions read ${shellWord(oneLine(address))} --agent ${shellWord(oneLine(agent))}`;

/**
 * Where a session is, as a list says it, in the names the agent gave: `me` is
 * the name of the person who is looking, whose DM with the agent is "your DM".
 * With no place, which is how an agent lists a session it has not learned the
 * place of, it is the session's address.
 */
export function placeWords(place: SessionPlace | null, address: string, me: string | undefined): string {
  return place === null ? oneLine(address) : placeWithThread(place, address, me);
}

/** Where sessions that are working are, for a row: the place of the one there is, or how many when there are several. */
function whereWords(sessions: SessionSummary[], me: string | undefined): string {
  const [only] = sessions;
  if (only === undefined || sessions.length > 1) return `${String(sessions.length)} sessions`;
  return only.place === null ? "another session" : placeLabel(only.place, me);
}

/**
 * What the list of agents says of an agent that is running: that it is idle, or
 * working, and, when it is working where the person's threads with it are not,
 * where, or in how many sessions when it is working in several. `sessions` is
 * how many it is working in, and `elsewhere` the ones that are none of the
 * person's threads with it.
 */
export function agentDetail(sessions: number, elsewhere: SessionSummary[], me: string | undefined): string {
  if (sessions === 0) return "idle";
  if (elsewhere.length === 0) return "working";
  return `working · ${sessions === 1 ? whereWords(elsewhere, me) : `${String(sessions)} sessions`}`;
}

const QUEUED_CHARACTERS = 200;

/** What a line of input that waits opens with, for when the session will take it. */
const QUEUED: Record<QueuedInput["when"], string> = {
  next_step: "queued for the next step",
  next_turn: "queued for the next turn",
  other: "queued",
};

/** Input a session has accepted and not picked up yet, on one line. */
export function queuedLine(input: QueuedInput): string {
  const text = shortLine(input.text, QUEUED_CHARACTERS);
  return `${QUEUED[input.when]}: ${text}`;
}

/**
 * Who is working, and what the session is doing. At least one name. `inThread`
 * says that the person can write in the place this is shown, where `/stop` is
 * how to stop the work, which they can't in a session they are only watching.
 */
export function workingLine(names: string[], activity: SessionActivity | undefined, inThread: boolean): string {
  const who = listed(names.map(oneLine));
  const verb = names.length > 1 ? "are" : "is";
  // That it is working is said already, and it would not be shown if it were idle.
  const doing = activity === undefined || activity.kind === "idle" || activity.kind === "working" ? undefined : activityWords(activity);
  return `${who} ${verb} working${doing === undefined ? "" : ` · ${doing}`}${inThread ? ` · write /${STOP} to stop` : ""}`;
}

/**
 * The commands the terminal acts on itself, which are never posted: what each
 * does in a DM with an agent and in a room, in one line. A command with no line
 * for a room is not listed there, and when it is written there the terminal
 * says where it works and posts nothing. The list of commands shows them with
 * the commands for agents.
 */
export const TERMINAL_COMMANDS = {
  devices: {
    dm: `List your devices, or take one back: ${TAKE_BACK}`,
    room: `List your devices, or take one back: ${TAKE_BACK}`,
  },
  status: {
    dm: "Show what the agent is doing, its model, tokens and cost.",
    room: "Show which agents here are running and working.",
  },
} as const satisfies Record<string, { dm: string; room?: string }>;

/** The name of a command for the terminal, without its slash. */
export type TerminalCommand = keyof typeof TERMINAL_COMMANDS;

/** The line beside `default` in the list that `/model ` opens: whose model it stands for, and which one that is. */
export const defaultModelLine = (agent: string, model: ModelId): string => `${oneLine(agent)}'s model: ${modelWords(model)}`;

/** What `/status` adds to the model of a thread when the thread was given it, and the agent's default when that is known. */
const chosenFor = (agent: string, defaultModel: ModelId | undefined): string =>
  defaultModel === undefined
    ? " (chosen for this thread)"
    : ` (chosen for this thread; ${agent}'s default is ${modelWords(defaultModel)})`;

/** The line over what `/status` or `/devices` read: which it was, whom it is for, and when it was read. */
export const statusHeader = (at: number, what: "status" | "devices" = "status"): string => `${what} · shown only to you · read ${localTime(at)}`;

const howMany = (count: number): string => (count === 0 ? "none" : String(count));

/** What `/status` read about an agent in its DM, one thing to a line. */
export function agentStatusRows(status: AgentStatus): string[] {
  const name = oneLine(status.name);
  const rows = [status.running ? `${name} · Shrimpy ${oneLine(status.version ?? "")} · running` : `${name} · not running`];
  if (status.doing !== undefined) rows.push(`Doing now: ${activityWords(status.doing)}`);
  if (!status.reached) {
    if (status.running) rows.push(`Not connected to ${name} just now, so its inputs, model and usage are not shown.`);
    return rows;
  }
  if (status.session !== undefined) {
    const { queued, model, own, defaultModel, usage } = status.session;
    rows.push(
      `Inputs waiting: ${howMany(queued)}`,
      `Model: ${model === null ? "none" : modelWords(model)}${own ? chosenFor(name, defaultModel) : ""}`,
      `This session: ${usageWords(usage)}`,
    );
  } else if (status.doing !== undefined) {
    rows.push(`${name} has no session in this thread yet.`);
  }
  const failure = status.session?.failure ?? null;
  if (failure !== null) rows.push(`Last turn: ${oneLine(failureWords(failure.reason, failure.detail))}`);
  for (const wakeup of status.session?.wakeups ?? []) rows.push(`${wakeupWords(wakeup, localTime(wakeup.due))}. Write /${STOP} to cancel it.`);
  if (status.othersWorking !== undefined) rows.push(`Other sessions working: ${howMany(status.othersWorking)}`);
  return rows;
}

/**
 * The line under a thread's work for a wake-up the agent waits on there: when
 * it comes, the note it brings, and, where the person can write, that `/stop`
 * cancels it.
 */
export function wakeupLine(agent: string, wakeup: WaitingWakeup, when: string, inThread: boolean): string {
  return `${oneLine(agent)} ${wakeupWords(wakeup, when).replace(/^Checks/, "checks")}${inThread ? ` · write /${STOP} to cancel it` : ""}`;
}

/** What `/devices` read, one device to a line, with how to take one back. */
export function devicesRows(status: DevicesStatus): string[] {
  if (status.devices.length === 0) {
    return ["You have no devices. Another machine of yours joins with the line that shrimpy invite prints, run there."];
  }
  return [
    ...status.devices.map((device) => (device.label === null ? oneLine(device.id) : `${oneLine(device.label)} · ${oneLine(device.id)}`)),
    `To take one back, write ${TAKE_BACK}. It is let go at once.`,
  ];
}

/** What `/status` read about the agents of a room, one to a line. */
export function roomStatusRows(status: RoomStatus): string[] {
  if (status.agents.length === 0) return ["No agent is in this room."];
  return status.agents.map(
    (agent) =>
      `${oneLine(agent.name)} · ${agent.running ? "running" : "not running"} · ${agent.working ? "working in this thread" : "not working in this thread"}`,
  );
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

/** The mark before how a tool call stands, and how to draw it. */
const TOOL_MARKS: Record<ToolStatus, { mark: string; tone: "good" | "bad" | "busy" | "idle" }> = {
  pending: { mark: "○", tone: "idle" },
  running: { mark: "●", tone: "busy" },
  done: { mark: "✓", tone: "good" },
  error: { mark: "✗", tone: "bad" },
  interrupted: { mark: "!", tone: "bad" },
};

/** How a tool call stands, with a mark, and how to draw it. */
export function toolStatus(status: ToolStatus): { label: string; tone: "good" | "bad" | "busy" | "idle" } {
  const { mark, tone } = TOOL_MARKS[status];
  return { label: `${mark} ${toolStatusWords(status)}`, tone };
}

/** A word on an answer that did not end the way an answer does. `ended` is how it ended, if it has. */
export function answerNote(ended: AnswerEnding | undefined): string | undefined {
  const words = endingWords(ended);
  return words === undefined ? undefined : `answer ${words}`;
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
  /** There is an input, and Enter sends what is typed in it. */
  send: boolean;
  /** Ctrl+N starts a thread. */
  newThread: boolean;
  /** Left and Right choose between everything on an agent's screen and only what is with the person. */
  filter: boolean;
  /** Tab turns a thread over to the session behind it as the agent sees it, and a session that was so turned back to the thread. */
  turnOver: boolean;
  /** Ctrl+O and Ctrl+T switch tool calls and thinking between brief and in full: work is shown here. */
  work: boolean;
}

/**
 * What the line of keys at the bottom of a screen says: every key that does
 * something there, each with what it does. Where Tab goes depends on which side
 * of a thread is on show: its conversation, or its session as the agent sees it.
 */
export function keyHints(screen: "agents" | "threads" | "thread" | "session", can: Can, inFull: InFull): string[] {
  const hints: string[] = [];
  if (screen === "thread" && can.send) hints.push("enter send");
  else if (screen === "agents" || screen === "threads") hints.push("↑↓ choose", "enter open");
  if (can.filter) hints.push("←→ everything or yours");
  if (can.newThread) hints.push("ctrl+n new thread");
  if (can.turnOver) hints.push(screen === "session" ? "tab conversation" : "tab agent's view");
  if (can.back) hints.push("esc back");
  if (can.work) {
    hints.push(`ctrl+o tool calls: ${inFull.toolCalls ? "full" : "brief"}`, `ctrl+t thinking: ${inFull.thinking ? "full" : "brief"}`);
  }
  hints.push("ctrl+d quit", can.send ? "ctrl+c clear, then quit" : "ctrl+c twice to quit");
  return hints;
}
export const QUIT_AGAIN = "Press Ctrl+C again to quit.";
