import {
  activityWords,
  type AnswerEnding,
  endingWords,
  failureWords,
  lastWords,
  type ModelId,
  modelWords,
  notRunWords,
  placeLabel,
  placeWords as placeWithThread,
  type QueuedInput,
  runningTriggerFields,
  type SessionActivity,
  type SessionPlace,
  type SessionStatus,
  type SessionSummary,
  type TriggerDetail,
  type TriggerSummary,
  usageWords,
  type WaitingWakeup,
  wakeupWords,
} from "../../contracts/agent/index.ts";
import {
  addToRoom,
  AGENT_COMMANDS,
  type AgentCommand,
  ARCHIVED,
  type Channel,
  channelLabel,
  DM_TAKES_NO_MORE,
  memberNames,
  roomLabel,
} from "../../contracts/chat/index.ts";
import { howToStartAgent, NO_CHAT_SERVER, NO_GATEWAY, newerThanGateway } from "../../contracts/gateway/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { listed, shellWord, upTo, withoutPeriod } from "../../lib/text/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { SHRIMPY_RELEASE_NAME, SHRIMPY_VERSION } from "../../lib/version/index.ts";
import type { Problem, Why } from "../network/index.ts";
import { type AgentStatus, type ClientCommand, commandNames, type DevicesStatus, type Notice, type RoomStatus } from "../state/index.ts";
import { shortLine } from "./cut.ts";
import { whenOf } from "./time.ts";

/*
 * Every sentence a client says, in one place, but for what it says of a
 * session, a receipt, what a thread or a channel is called, what to start and a
 * program of another version, which it takes from the contracts as the commands
 * do, and frames here. They are plain and short, in the voice of the commands:
 * what happened, and what to do next. Where the commands already say it, a
 * client says it the same way. A name, an ID or a message that came from
 * another program is put on one line and made harmless here, whoever calls,
 * so no sentence can carry anything else.
 */

/** The command a person writes in a thread to stop the work there. */
const STOP: AgentCommand = "stop";

/** The command a person writes in a thread to see or change the model of the thread's session. */
const MODEL: AgentCommand = "model";

/** How a device is taken back, as the person writes it. */
const TAKE_BACK = "/devices take back <device>";

/** What `/devices` does, the same in a DM and a room. */
const DEVICES = `List your devices, or take one back: ${TAKE_BACK}`;

/** The commands a person writes in a thread to rename it, and to bring it back once it is archived. */
const RENAME: ClientCommand = "rename";
const UNARCHIVE: ClientCommand = "unarchive";

/** What renaming, archiving and bringing back a thread do, the same in a DM and a room. */
const RENAMES = `Name this thread: /${RENAME} <name>`;
const ARCHIVES = "Hide this thread from the lists.";
const UNARCHIVES = "Bring this thread back to the lists.";

/** What `/update` does, the same in a DM and a room. */
const UPDATE = "Install the gateway's version of Shrimpy on this machine, and open the terminal again.";

/** That this machine runs an older Shrimpy than the gateway's `gateway`, and how to update it. */
export const behindNote = (gateway: string): string =>
  `This machine runs Shrimpy ${SHRIMPY_VERSION}, older than the gateway's ${oneLine(gateway)}. Write /update in a thread to install ${oneLine(gateway)} here.`;

/** What `/model` is written with to have the thread follow the agent's model again. */
export const MODEL_DEFAULT = "default";

/** The program a problem is about. */
export type Program = { kind: "chat" } | { kind: "gateway" } | { kind: "agent"; name: string };

const CHAT = "the chat server";

/** What to tell about the gateway, if it is not as it should be. `self` is what the client calls itself. */
export function gatewayNote(why: Why, self: string): string | undefined {
  switch (why.kind) {
    case "not-running":
      return NO_GATEWAY;
    case "refused":
      return `The gateway turned ${self} away: ${oneLine(why.words)}`;
    case "unproven":
      return oneLine(why.words);
    case "lost":
      return "Lost the connection to the gateway. The list of agents may be out of date. Trying again.";
    case "unreachable":
      return `Could not reach the gateway: ${oneLine(why.message)}`;
    case "connecting":
    case "not-linked":
    case "other-version":
      return undefined;
  }
}

/** What to tell about the chat server, if it is not as it should be. */
export function chatNote(why: Why): string | undefined {
  switch (why.kind) {
    case "not-linked":
      return NO_CHAT_SERVER;
    case "lost":
      return "Lost the connection to the chat server. What is shown may be out of date, and nothing can be sent. Trying again.";
    case "unreachable":
      return oneLine(why.message);
    case "connecting":
    case "not-running":
    case "refused":
    case "unproven":
    case "other-version":
      return undefined;
  }
}

/**
 * What to tell about the agent whose list is open, if it is not as it should be.
 * `looking` is what is on show: the work in a thread, or the agent's sessions.
 * `home` says whether this machine has a home for the agent, when the client
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
      return `No agent named ${name} is linked to this machine's gateway. ${howToStartAgent(agent, home)}`;
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
    case "other-version":
      return undefined;
  }
}

/** What a program said when it refused, as the end of a sentence. */
const saidAsReason = (said: string): string => withoutPeriod(oneLine(said));

/** What the agent said when it would not list its sessions, or would not let one be watched. */
export function refusalNote(looking: "sessions" | "session", agent: string, said: string): string {
  const reason = saidAsReason(said);
  return looking === "sessions" ? `Could not list the sessions of ${oneLine(agent)}: ${reason}.` : `Could not watch the session: ${reason}.`;
}

/** That the client, which calls itself `self`, or a program runs Shrimpy `version`, newer than the gateway's `gateway`, if it does. */
export function newerNote(what: { kind: "self"; self: string } | Exclude<Program, { kind: "gateway" }>, version: string, gateway: string): string | undefined {
  const named = what.kind === "self" ? what.self : what.kind === "chat" ? CHAT : `the agent ${oneLine(what.name)}`;
  return newerThanGateway(named, version, gateway);
}

/** Why something could not be done, as the end of a sentence. `self` is what the client calls itself. */
function because(program: Program, problem: Problem, self: string): string {
  const who = program.kind === "chat" ? CHAT : program.kind === "gateway" ? "the gateway" : oneLine(program.name);
  if ("said" in problem) return saidAsReason(problem.said);
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
      return `the gateway turned ${self} away: ${withoutPeriod(oneLine(problem.down.words))}`;
    case "unproven":
      return withoutPeriod(oneLine(problem.down.words));
    case "unreachable":
      return withoutPeriod(oneLine(problem.down.message));
    case "other-version":
      return `${who} runs another version of Shrimpy than ${self}`;
  }
}

/** What a notice says. `agent` is the agent the person is talking to, and `self` what the client calls itself. */
export function noticeText(notice: Notice, agentName: string, self: string): string {
  const agent = oneLine(agentName);
  switch (notice.kind) {
    case "not-sent":
      return `Not sent: ${because({ kind: "chat" }, notice.problem, self)}. Your message is still in the editor.`;
    case "not-opened":
      return `Could not open the thread: ${because({ kind: "chat" }, notice.problem, self)}.`;
    case "not-joined":
      return `Could not join the room: ${because({ kind: "chat" }, notice.problem, self)}.`;
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
      return `Could not read the model of this thread: ${because({ kind: "agent", name: agent }, notice.problem, self)}.`;
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
      return `Could not take the device back: ${because({ kind: "gateway" }, notice.problem, self)}.`;
    case "thread-name":
      return notice.name === null
        ? `This thread has no name, so it shows how it starts. To name it, write /${RENAME} and a name.`
        : `This thread is called "${oneLine(notice.name)}". To rename it, write /${RENAME} and a name.`;
    case "archived-already":
      return `This thread is archived already. Write /${UNARCHIVE} to bring it back.`;
    case "not-archived":
      return "This thread is not archived.";
    case "not-changed":
      return `Could not ${CHANGES[notice.change]}: ${because({ kind: "chat" }, notice.problem, self)}.`;
    case "nothing-to-update":
      return notice.gateway === undefined
        ? `What the gateway runs is known once ${self} links to it. Nothing was updated.`
        : `This machine runs Shrimpy ${SHRIMPY_VERSION}, and the gateway ${oneLine(notice.gateway)}, so there is nothing to update.`;
  }
}

/** What each change to a thread does, as a sentence says it failed to. */
const CHANGES: Record<Extract<Notice, { kind: "not-changed" }>["change"], string> = {
  rename: "rename the thread",
  archive: "archive the thread",
  unarchive: "bring the thread back",
};

/** What `/model` with nothing after it says: the model the thread uses, whose it is, and how to choose another. */
function modelIs(agent: string, notice: Extract<Notice, { kind: "model-is" }>): string {
  const choose = `/${MODEL} and a space`;
  if (notice.model === null) return `This thread has no model yet. To choose one, write ${choose}.`;
  const used = modelWords(notice.model);
  if (!notice.own) return `This thread uses ${used}, ${agent}'s default model. To choose another, write ${choose}.`;
  const home = notice.defaultModel === undefined ? "" : ` ${agent}'s default is ${modelWords(notice.defaultModel)}.`;
  return `This thread uses ${used}, a model chosen for this thread.${home} Write /${MODEL} ${MODEL_DEFAULT} to follow ${agent}'s model again, or ${choose} to choose another.`;
}

/** The line printed when a client is left while an agent is still working. */
export function farewellLine(agentName: string, threadId: string): string {
  const agent = oneLine(agentName);
  const thread = oneLine(threadId);
  return (
    `${agent} is still working in thread ${thread}, and the work continues. ` +
    `To stop it, open the thread and write /${STOP}, or run: shrimpy sessions stop ${thread} --agent ${agent}`
  );
}

export const THREAD_EMPTY = "No messages yet.";
export const DELETED = "This message was deleted.";

/** What marks a message that was edited, with when. */
export const editedAt = (when: string): string => `edited ${when}`;

/** Who put one emoji on a message, by name, in the order they did. */
export const reactedBy = (names: string[]): string => names.join(", ");

/** The emoji on a message and who put each there, on one line, as the terminal says them. */
export const reactionsLine = (reactions: readonly { emoji: string; by: string }[]): string => reactions.map(({ emoji, by }) => `${emoji} ${by}`).join("  ");

/** What a trigger's line says after the trigger's name, before when it fired. */
export const FIRED = "fired";

/** What stands before the first message that was new to the person when they opened the thread, on a line of its own. */
export const NEW_SINCE = "while you were away";
/** The same in a word, for where it stands inside a rule. */
export const NEW_SINCE_SHORT = "new";

/** The line under Shrimpy's wordmark: its version, then the release's name, in two parts so that a client can set the name apart. */
export const versionLine = (): [lead: string, release: string] => [`${SHRIMPY_VERSION} · `, SHRIMPY_RELEASE_NAME];

export const agentsTitle = (): string => `shrimpy · ${versionLine().join("")}`;

/** What an agent's list shows: everything the agent takes part in, or only what is with the person. */
export type ListFilter = "everything" | "yours";

/** The row at the foot of a list that opens its archived threads in place, with how many there are. */
export const archivedRow = (count: number): string => `${ARCHIVED} · ${String(count)}`;

/**
 * The labels over the parts of a list: the agents and the rooms, a room's
 * threads, and on an agent's list its threads with the person apart from the
 * rest; and the names of an agent's triggers and its home, where a client shows
 * them.
 */
export const LABELS = {
  agents: "agents",
  rooms: "rooms",
  threads: "threads",
  yours: "your threads",
  elsewhere: "elsewhere",
  triggers: "triggers",
  home: "home",
} as const;

/** What each of the two views of an agent's list is called where both are offered. */
export const FILTERS: Record<ListFilter, string> = { everything: "everything", yours: "yours" };


/** What stands where a thread would be while nothing is open: no list, or nothing in the open list. */
export const PICK_LIST = "Pick an agent or a room.";
export const PICK_THREAD = "Pick a thread.";
/** The same where a thread can be started too. `key` is the client's key that starts one, as the client writes it. */
export const pickOrStart = (key: string): string => `${withoutPeriod(PICK_THREAD)}, or press ${key} to start one.`;
/** `said`, then how to start a thread, where there is none to pick. `key` is the client's key that starts one, as the client writes it. */
export const thenStart = (said: string, key: string): string => `${said} Press ${key} to start a thread.`;
/** What stands where a thread would be while nothing is open on the list of an agent that is not running. */
export const notRunning = (agent: string): string => `${oneLine(agent)} is not running.`;
/** The line under a running agent's name on its list: the model it follows by default, when it has said, and the version of Shrimpy it runs. */
export const agentFacts = (model: ModelId | undefined, version: string | undefined): string =>
  [model === undefined ? undefined : modelWords(model), version === undefined ? undefined : `Shrimpy ${oneLine(version)}`]
    .filter((part) => part !== undefined)
    .join(" · ");

/** That more wake-ups wait than the one shown. */
export const moreWakeups = (count: number): string => `${String(count)} more`;
/** That more wake-ups wait than the one shown, and where all of them are listed. */
export const moreWakeupsListed = (count: number): string => `${moreWakeups(count)} in /status`;

/** The title of the window a client is in: Shrimpy, how many agents are working, and how much is new to the person. */
export function windowTitle(working: number, fresh: number): string {
  return ["🦐 shrimpy", working > 0 ? `${String(working)} working` : "", fresh > 0 ? `${String(fresh)} new` : ""]
    .filter((part) => part !== "")
    .join(" · ");
}
/** What is watched, as a session's title says it after the agent's name: `where` is where the session is, as `placeWords` says, or the thread it is behind. */
export const watchingWords = (where: string): string => `watching ${oneLine(where)}`;
/** `who` is the agent's name, and `watching` what `watchingWords` says. */
export const sessionTitle = (who: string, watching: string): string => `${oneLine(who)} · ${watching}`;
export const SESSION_EMPTY = "Nothing in this session yet.";
/** The label over what a session was shown. */
export const SHOWN = "shown";
/** Where the session behind a thread is, as its agent's view names it: the place as the agent's list says it, then "main" for a room's main thread, or the thread's title. */
export const behindThread = (place: string, main: boolean, title: string): string => `${place} · ${main ? "main" : oneLine(title)}`;
/** That an agent is not linked to the gateway, wherever it is said in a word. */
export const NOT_RUNNING = "not running";
/** Under an agent's view: what the session is doing, how many inputs wait, its model and what it has used. `busy` says it is working. */
export function sessionFoot(status: SessionStatus, busy: boolean): string {
  const waiting = status.queued.length > 0 ? `${String(status.queued.length)} waiting` : undefined;
  const doing = busy ? activityWords(status.activity) : activityWords({ kind: "idle" });
  return [doing, waiting, status.model === null ? undefined : modelWords(status.model), usageWords(status.usage)].filter((part) => part !== undefined).join(" · ");
}
/** What a thread itself is called, as its title says it after who it is with: `title` on one line, or that it is new while it has none. */
export const threadCalled = (title: string | undefined): string => (title === undefined ? "new thread" : oneLine(title));
/** `who` is what the conversation is called: an agent's name or a room's label, and `called` what `threadCalled` says. */
export const threadTitle = (who: string, called: string): string => `${oneLine(who)} · ${called}`;
export const newThreadHint = (agent: string): string => `New thread with ${oneLine(agent)}. Type below to start it.`;
export const newRoomThreadHint = (room: string): string => `New thread in ${roomLabel(room)}. Type below to start it.`;

/** The word on a row of the agents and rooms for a room that the person is not in and only reads. */
export const READ_ONLY_TAG = "read-only";
/** The word beside the name of an agent that the roster has as an admin. */
export const ADMIN_TAG = "admin";

/**
 * What is said of a room the person only reads: that it is only read, which
 * comes first so that a narrow screen does not cut it, then its members.
 */
export function readOnlyDetail(room: Pick<Channel, "members">): string {
  return [READ_ONLY_TAG, membersLine(room.members)].filter((part) => part !== "").join(" · ");
}

/** The names of a channel's members, on one line, in alphabetical order. */
export const membersLine = (members: Channel["members"]): string => memberNames(members).join(", ");

/**
 * The line that stands where the input would be in a thread of a channel the
 * person only reads: that they only read it, and how to join a room, with their
 * own name, `me`, as the command takes it, or that a DM can't be joined.
 */
export function readOnlyLine(channel: Pick<Channel, "kind" | "name" | "members">, me: string | undefined): string {
  if (channel.kind === "dm") return `You are only reading the ${channelLabel(channel)}. ${DM_TAKES_NO_MORE}`;
  return `You are only reading ${roomLabel(channel.name)}. To join it, run: ${addToRoom(channel.name, me)}`;
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
 * Who is working, and what the session is doing. At least one name, and more
 * than three are two and how many more. `inThread` says that the person can
 * write in the place this is shown, where `/stop` is how to stop the work,
 * which they can't in a session they are only watching. `counted` says how
 * many agents in place of their names, for where the names don't fit.
 */
export function workingLine(names: string[], activity: SessionActivity | undefined, inThread: boolean, counted = false): string {
  const each = names.map(oneLine);
  const who = counted ? `${String(names.length)} agents` : each.length > 3 ? upTo(each, 2).join(", ") : listed(each);
  const verb = names.length > 1 ? "are" : "is";
  // That it is working is said already, and it would not be shown if it were idle.
  const doing = activity === undefined || activity.kind === "idle" || activity.kind === "working" ? undefined : activityWords(activity);
  return `${who} ${verb} working${doing === undefined ? "" : ` · ${doing}`}${inThread ? ` · write /${STOP} to stop` : ""}`;
}

/** A part of a sentence: words, or a command that a person runs or writes, which a client sets apart. */
export interface SaidPart {
  text: string;
  command: boolean;
}

/** Every command a person writes in a thread, with its slash. */
const THREAD_COMMANDS = [...new Set([...commandNames("dm"), ...commandNames("room")])];

/** A command in a sentence: one written in a thread, standing alone, or a `shrimpy` command after a colon, up to a comma or the sentence's end. */
const COMMAND = new RegExp(`(?<=: )shrimpy [^,]*?(?=\\.?$|, )|(?<=^|\\s)(?:${THREAD_COMMANDS.join("|")})(?=$|[\\s.,:;])`, "g");

/** A sentence in parts, each command in it set apart, so that a client can draw a command as one. */
export function commandParts(sentence: string): SaidPart[] {
  const parts: SaidPart[] = [];
  let at = 0;
  for (const found of sentence.matchAll(COMMAND)) {
    if (found.index > at) parts.push({ text: sentence.slice(at, found.index), command: false });
    parts.push({ text: found[0], command: true });
    at = found.index + found[0].length;
  }
  if (at < sentence.length) parts.push({ text: sentence.slice(at), command: false });
  return parts;
}

/**
 * What each command the client acts on itself does, in one line, in a DM with
 * an agent and in a room. The list of commands shows them with the commands
 * for agents.
 */
export const CLIENT_COMMAND_LINES = {
  archive: { dm: ARCHIVES, room: ARCHIVES },
  devices: { dm: DEVICES, room: DEVICES },
  rename: { dm: RENAMES, room: RENAMES },
  status: {
    dm: "Show what the agent is doing, its model, tokens and cost.",
    room: "Show which agents here are running and working.",
  },
  unarchive: { dm: UNARCHIVES, room: UNARCHIVES },
  update: { dm: UPDATE, room: UPDATE },
} as const satisfies Record<ClientCommand, { dm: string; room: string }>;

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

/** That `/stop` written in a thread cancels the wake-ups waited on there, `count` of them: the one way it is said. */
const stopCancels = (count: number): string => `/${STOP} cancels ${count === 1 ? "it" : "them"}`;

/**
 * What `/stop` does to the `count` wake-ups waited on in a thread, said once
 * under all of them: in a DM with the agent called `agent`, with its work, and
 * in a room, with every agent's work, and how to stop only `agent`'s.
 */
export function stopCancelsAll(count: number, where: "dm" | "room", agent: string): string {
  const name = oneLine(agent);
  return where === "dm"
    ? `${stopCancels(count)}, with ${name}'s work here.`
    : `${stopCancels(count)}, with every agent's work here, and @${name} /${STOP} only ${name}'s.`;
}

/** What `/status` read about an agent in its DM, one thing to a line. */
export function agentStatusRows(status: AgentStatus): string[] {
  const name = oneLine(status.name);
  const rows = [status.running ? `${name} · Shrimpy ${oneLine(status.version ?? "")} · running` : `${name} · ${NOT_RUNNING}`];
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
  const wakeups = status.session?.wakeups ?? [];
  for (const wakeup of wakeups) rows.push(wakeupWords(wakeup, localTime(wakeup.due)));
  if (wakeups.length > 0) rows.push(stopCancelsAll(wakeups.length, "dm", name));
  if (status.othersWorking !== undefined) rows.push(`Other sessions working: ${howMany(status.othersWorking)}`);
  return rows;
}

/**
 * A wake-up an agent waits on in a thread: who, when it comes and the note it
 * brings, and, where it is the one wake-up there and the person can write,
 * that `/stop` cancels it.
 */
export function wakeupLine(agent: string, wakeup: WaitingWakeup, when: string, stops: boolean): string {
  return `${oneLine(agent)} ${wakeupWords(wakeup, when).replace(/^Checks/, "checks")}${stops ? ` · ${stopCancels(1)}` : ""}`;
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

/** What `/status` read about the agents of a room, one to a line, then every wake-up they wait on in the thread and, once, what `/stop` does to them. */
export function roomStatusRows(status: RoomStatus): string[] {
  const rows =
    status.agents.length === 0
      ? ["No agent is in this room."]
      : status.agents.map(
          (agent) =>
            `${oneLine(agent.name)} · ${agent.running ? "running" : NOT_RUNNING} · ${agent.working ? "working in this thread" : "not working in this thread"}`,
        );
  for (const { agent, wakeup } of status.wakeups) rows.push(wakeupLine(agent, wakeup, localTime(wakeup.due), false));
  const [first] = status.wakeups;
  if (first !== undefined) rows.push(stopCancelsAll(status.wakeups.length, "room", first.agent));
  return rows;
}

/** What marks a title or a block that may no longer be current. */
export const OUT_OF_DATE = "out of date";
/** The same, beside a title or over a block. */
export const OUT_OF_DATE_MARK = `(${OUT_OF_DATE})`;

/** How tool calls are shown, and how thinking is, as the switch between brief and in full says each. */
export const toolCallsShown = (full: boolean): string => `tool calls: ${full ? "full" : "brief"}`;
export const thinkingShown = (full: boolean): string => `thinking: ${full ? "full" : "brief"}`;
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

/*
 * What a page says besides what both clients say: when it tries the gateway
 * again, what its input says before anything is typed, the wake-ups waiting in
 * a thread when all of them are shown, an agent's home and triggers, how a
 * browser is labelled among your devices, and what a notification is titled.
 */

/** When the page tries to reach the gateway again, under the note that says it can't. */
export const nextTry = (seconds: number): string => `next try in ${String(seconds)}s`;

/** What the input says before anything is typed. `who` is what the conversation is called. */
export const writeTo = (who: string): string => `Write to ${oneLine(who)}`;

/** Over the wake-ups waiting in a thread, when all of them are shown. */
export const CHECKING_BACK = "checking back here";

/** What stands where a file would be while no file of an agent's home is open. */
export const PICK_FILE = "Pick a file.";

/** What a folder or a file of an agent's home that has nothing in it shows. */
export const EMPTY = "(empty)";

/** A file's size as a person reads it. */
export function sizeWords(bytes: number): string {
  if (bytes < 1000) return `${String(bytes)} B`;
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} kB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/** Why a folder or a file of an agent's home could not be read. `self` is what the client calls itself. */
export const homeNote = (agent: string, problem: Problem, self: string): string =>
  `Could not read the home of ${oneLine(agent)}: ${because({ kind: "agent", name: agent }, problem, self)}.`;

/** That an agent has no triggers, and whom to ask for one: the agent, and the admin agents but it, by name. */
export const noTriggers = (agent: string, admins: string[]): string =>
  `${oneLine(agent)} has no triggers. Ask it to make one${admins.length === 0 ? "" : `, or ask ${listed(admins.map(oneLine), "or")}`}.`;

/** The line over the tree of an agent's home, which names the folder the tree starts at. */
export const homeRoot = (agent: string): string => `agents/${oneLine(agent)}/`;

/** What an agent's home shows while the agent is not running. */
export const homeNotRunning = (agent: string): string => `${oneLine(agent)} is not running, so its home can't be read.`;

/** Why what defines a trigger could not be read. `self` is what the client calls itself. */
export const triggerNote = (agent: string, problem: Problem, self: string): string =>
  `Could not read the trigger from ${oneLine(agent)}: ${because({ kind: "agent", name: agent }, problem, self)}.`;

/** What defines a trigger of a running agent, a line each, to go under its heading, with each time as the views say a time. */
export const triggerLines = (trigger: TriggerDetail, now: number): string[] => runningTriggerFields(trigger, (time) => whenOf(time, now));

/** How a trigger's last occurrence went, under what defines it, or that it has made none. */
export const lastOccurrence = (trigger: Pick<TriggerSummary, "last" | "lastCheck">, now: number): string =>
  trigger.last === null ? notRunWords(trigger) : `last ${lastWords(trigger.last, whenOf(trigger.last.firedAt, now))}`;

/** The platforms a browser's user agent names, the more particular first, since an iPhone's names a Mac and Android's names Linux. */
const PLATFORMS = ["iPhone", "iPad", "Android", "Mac", "Windows", "Linux"];

/** How a browser is labelled among your devices, from its user agent. */
export function browserLabel(userAgent: string): string {
  const platform = PLATFORMS.find((name) => userAgent.includes(name));
  return platform === undefined ? "a browser" : `a browser on ${platform}`;
}

/** That the door's answer to an invitation's code couldn't be read, with the status it came with. */
export const unreadableJoin = (status: number): string =>
  `The gateway answered the invitation's code with something this page can't read (HTTP ${String(status)}). Reload the page, or ask for a new invitation.`;

/** What a notification says when what was pushed can't be read: only that there is something new. */
export const SOMETHING_NEW = "Something new in Shrimpy";

/** What a notification is titled: who wrote, and the room, for a message in one. */
export const notificationTitle = (from: string, room: string | null): string =>
  room === null ? oneLine(from) : `${oneLine(from)} in ${roomLabel(room)}`;
