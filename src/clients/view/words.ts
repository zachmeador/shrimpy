import {
  activityWords,
  type AnswerEnding,
  describeSchedule,
  endingWords,
  failureWords,
  lastWords,
  type ModelId,
  modelWords,
  onceTriggerPrompt,
  placeLabel,
  type QueuedInput,
  type SessionActivity,
  type SessionStatus,
  type SessionSummary,
  type TriggerSummary,
  usageWords,
} from "../../contracts/agent/index.ts";
import {
  addToRoom,
  AGENT_COMMANDS,
  type AgentCommand,
  ARCHIVED,
  type Channel,
  channelLabel,
  DM_TAKES_NO_MORE,
  MAX_ATTACHED_BYTES,
  MAX_ATTACHMENTS,
  memberNames,
  roomLabel,
} from "../../contracts/chat/index.ts";
import { howToStartAgent, type Machine, NO_CHAT_SERVER, NO_GATEWAY, newerThanGateway } from "../../contracts/gateway/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { listed, shellWord, sizeWords, upTo, withoutPeriod } from "../../lib/text/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { SHRIMPY_RELEASE_NAME, SHRIMPY_VERSION } from "../../lib/version/index.ts";
import type { Problem, Why } from "../network/index.ts";
import { type AgentStatus, type ClientCommand, commandNames, type DevicesStatus, type Notice, type RoomStatus } from "../state/index.ts";
import { shortLine } from "./cut.ts";
import { elapsedOf, whenOf } from "./time.ts";

/*
 * Every sentence a client says, in one place, but for what it says of a
 * session, a receipt, what a thread or a channel is called, what to start and a
 * program of another version, which it takes from the contracts as the commands
 * do, and frames here.
 */

const STOP: AgentCommand = "stop";
const MODEL: AgentCommand = "model";
const TAKE_BACK = "/devices take back <device>";
const DEVICES = `List your devices, or take one back: ${TAKE_BACK}`;
const RENAME: ClientCommand = "rename";
const UNARCHIVE: ClientCommand = "unarchive";
const RENAMES = `Name this thread: /${RENAME} <name>`;
const ARCHIVES = "Hide this thread from the lists.";
const UNARCHIVES = "Bring this thread back to the lists.";
const KILL = "End a command running in the background in this thread.";
const DROP = "Stop waiting on an agent in this thread.";
const CANCEL = "Cancel a one-time trigger set for this thread.";
const PAUSE = "Pause a standing trigger that comes to this thread.";
const RESUME = "Resume a paused trigger that comes to this thread.";
const UPDATE = "Install the gateway's version of Shrimpy on this machine, and open the terminal again.";

export const behindNote = (gateway: string): string =>
  `This machine runs Shrimpy ${SHRIMPY_VERSION}, older than the gateway's ${oneLine(gateway)}. Write /update in a thread to install ${oneLine(gateway)} here.`;

export const MODEL_DEFAULT = "default";

export type Program = { kind: "chat" } | { kind: "gateway" } | { kind: "agent"; name: string };

const CHAT = "the chat server";

const countOf = (n: number, one: string): string => `${String(n)} ${one}${n === 1 ? "" : one.endsWith("s") ? "es" : "s"}`;

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

const saidAsReason = (said: string): string => withoutPeriod(oneLine(said));

export function refusalNote(looking: "sessions" | "session", agent: string, said: string): string {
  const reason = saidAsReason(said);
  return looking === "sessions" ? `Could not list the sessions of ${oneLine(agent)}: ${reason}.` : `Could not watch the session: ${reason}.`;
}

export function newerNote(what: { kind: "self"; self: string } | Exclude<Program, { kind: "gateway" }>, version: string, gateway: string): string | undefined {
  const named = what.kind === "self" ? what.self : what.kind === "chat" ? CHAT : `the agent ${oneLine(what.name)}`;
  return newerThanGateway(named, version, gateway);
}

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

const ACTIONS: Record<Extract<Notice, { kind: "action-failed" }>["what"], string> = {
  kill: "end the background command",
  drop: "stop waiting",
  cancel: "cancel the trigger",
  pause: "pause the trigger",
  resume: "resume the trigger",
  fire: "run the trigger",
  stop: "stop the turn",
};

export function noticeText(notice: Notice, agentName: string, self: string): string {
  const agent = oneLine(agentName);
  switch (notice.kind) {
    case "not-sent":
      return `Not sent: ${because({ kind: "chat" }, notice.problem, self)}. Your message is still in the editor.`;
    case "not-attached":
      return notice.why === "big"
        ? `Not attached: ${oneLine(notice.name)} is ${sizeWords(notice.size)}, and a message carries up to ${sizeWords(MAX_ATTACHED_BYTES)}.`
        : `Not attached: ${oneLine(notice.name)}, since a message carries up to ${MAX_ATTACHMENTS} files.`;
    case "files-with-command":
      return "A command takes no files, so nothing was sent. Send the files in a message of their own.";
    case "not-fetched": {
      const from: Program = notice.agent === undefined ? { kind: "chat" } : { kind: "agent", name: notice.agent };
      return `Could not open ${notice.name === undefined ? "the picture" : oneLine(notice.name)}: ${because(from, notice.problem, self)}.`;
    }
    case "no-clipboard":
      return `The clipboard can't be read from ${self}.`;
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
    case "no-member":
      return `No one in this room is called ${oneLine(notice.written)}. Nothing was posted.`;
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
    case "stop-still-going": {
      const left = [
        notice.processes > 0 ? `${countOf(notice.processes, "process")}, which /kill ends` : undefined,
        notice.waitingOn.length > 0 ? waitingOnLine(notice.waitingOn, true) : undefined,
        notice.triggers > 0 ? countOf(notice.triggers, "trigger") : undefined,
      ].filter((part): part is string => part !== undefined);
      const lead = notice.hadTurn ? "/stop ended the turn, and nothing else" : "No turn is running here, and /stop ends nothing else";
      return `${lead}. Still going here: ${listed(left)}.`;
    }
    case "no-processes":
      return "This thread runs no command in the background.";
    case "many-processes":
      return `This thread runs ${countOf(notice.ids.length, "command")} in the background: ${listed(notice.ids.map(oneLine))}. Write /kill and one of them.`;
    case "no-watches":
      return "This thread waits on no one.";
    case "many-watches":
      return `This thread waits on ${countOf(notice.agents.length, "agent")}: ${listed(notice.agents.map(oneLine))}. Write /drop and one of them.`;
    case "no-triggers": {
      const kind = notice.action === "cancel" ? "one-time trigger" : notice.action === "pause" ? "trigger that is on" : "paused trigger";
      return `No ${kind} comes to this thread.`;
    }
    case "many-triggers":
      return `${String(notice.names.length)} of them come to this thread: ${listed(notice.names.map(oneLine))}. Write /${notice.action} and one of them.`;
    case "action-failed":
      return `Could not ${ACTIONS[notice.what]}: ${because({ kind: "agent", name: notice.agent }, notice.problem, self)}.`;
  }
}

const CHANGES: Record<Extract<Notice, { kind: "not-changed" }>["change"], string> = {
  rename: "rename the thread",
  archive: "archive the thread",
  unarchive: "bring the thread back",
};

function modelIs(agent: string, notice: Extract<Notice, { kind: "model-is" }>): string {
  const choose = `/${MODEL} and a space`;
  if (notice.model === null) return `This thread has no model yet. To choose one, write ${choose}.`;
  const used = modelWords(notice.model);
  if (!notice.own) return `This thread uses ${used}, ${agent}'s default model. To choose another, write ${choose}.`;
  const home = notice.defaultModel === undefined ? "" : ` ${agent}'s default is ${modelWords(notice.defaultModel)}.`;
  return `This thread uses ${used}, a model chosen for this thread.${home} Write /${MODEL} ${MODEL_DEFAULT} to follow ${agent}'s model again, or ${choose} to choose another.`;
}

export function farewellLine(agentName: string, threadId: string): string {
  const agent = oneLine(agentName);
  const thread = oneLine(threadId);
  return (
    `${agent} is still working in thread ${thread}, and the work continues. ` +
    `To stop it, open the thread and write /${STOP}, or run: shrimpy sessions stop ${thread} --agent ${agent}`
  );
}

/** Command line shown in the terminal on a read-only thread while an agent is working in it. */
export function stopReadOnlyCommand(threadId: string, agentName: string): string {
  return `To stop it, run: shrimpy sessions stop ${shellWord(oneLine(threadId))} --agent ${shellWord(oneLine(agentName))}`;
}

export const THREAD_EMPTY = "No messages yet.";
export const DELETED = "This message was deleted.";
export const editedAt = (when: string): string => `edited ${when}`;
export const reactedBy = (names: string[]): string => names.join(", ");
export const reactionsLine = (reactions: readonly { emoji: string; by: string }[]): string => reactions.map(({ emoji, by }) => `${emoji} ${by}`).join("  ");
export const FIRED = "fired";
export const NEW_SINCE = "while you were away";
export const NEW_SINCE_SHORT = "new";
export const versionLine = (): [lead: string, release: string] => [`${SHRIMPY_VERSION} · `, SHRIMPY_RELEASE_NAME];
export const agentsTitle = (): string => `shrimpy · ${versionLine().join("")}`;

export type AgentTab = "chat" | "observe";
export const AGENT_TABS: readonly AgentTab[] = ["chat", "observe"];
export const archivedRow = (count: number): string => `${ARCHIVED} · ${String(count)}`;

export const LABELS = {
  agents: "agents",
  rooms: "rooms",
  threads: "threads",
  processes: "processes",
  triggers: "triggers",
  home: "home",
} as const;

export const PICK_LIST = "Pick an agent or a room.";
export const PICK_THREAD = "Pick a thread.";
export const pickOrStart = (key: string): string => `${withoutPeriod(PICK_THREAD)}, or press ${key} to start one.`;
export const thenStart = (said: string, key: string): string => `${said} Press ${key} to start a thread.`;
export const notRunning = (agent: string): string => `${oneLine(agent)} is not running.`;
export const nothingElse = (agent: string): string => `${oneLine(agent)} takes part in nothing else yet.`;

/** Count of additional items of a kind in the thread dock. */
export const moreCount = (count: number): string => `${String(count)} more`;
/** Count of additional items listed in `/status` (terminal dock). */
export const moreListed = (count: number): string => `${moreCount(count)} in /status`;
/** Heading for multiple background commands when expanded on web. */
export const backgroundCommandsCount = (count: number): string => `${countOf(count, "command")} in the background`;

export function windowTitle(working: number, fresh: number): string {
  return ["🦐 shrimpy", working > 0 ? `${String(working)} working` : "", fresh > 0 ? `${String(fresh)} new` : ""]
    .filter((part) => part !== "")
    .join(" · ");
}

export const watchingWords = (where: string): string => `watching ${oneLine(where)}`;
export const sessionTitle = (who: string, watching: string): string => `${oneLine(who)} · ${watching}`;
export const SESSION_EMPTY = "Nothing in this session yet.";
export const SHOWN = "shown";

/** What a model that takes no pictures was shown in place of one, as Pi words it. */
export const PICTURE_OMITTED = "(image omitted: model does not support images)";
export const behindThread = (place: string, title: string): string => `${place} · ${oneLine(title)}`;
export const NOT_RUNNING = "not running";
export const TURNED_AWAY = "turned away";

export function sessionFoot(status: SessionStatus, busy: boolean): string {
  const waiting = status.queued.length > 0 ? `${String(status.queued.length)} waiting` : undefined;
  const doing = busy ? activityWords(status.activity) : activityWords({ kind: "idle" });
  return [doing, waiting, status.model === null ? undefined : modelWords(status.model), usageWords(status.usage)].filter((part) => part !== undefined).join(" · ");
}

export const threadCalled = (title: string | undefined): string => (title === undefined ? "new thread" : oneLine(title));
export const threadTitle = (who: string, called: string): string => `${oneLine(who)} · ${called}`;
export const newThreadHint = (agent: string): string => `New thread with ${oneLine(agent)}. Type below to start it.`;
export const newRoomThreadHint = (room: string): string => `New thread in ${roomLabel(room)}. Type below to start it.`;

export const READ_ONLY_TAG = "read-only";
export const ADMIN_TAG = "admin";

export function readOnlyDetail(room: Pick<Channel, "members">): string {
  return [READ_ONLY_TAG, membersLine(room.members)].filter((part) => part !== "").join(" · ");
}

export const membersLine = (members: Channel["members"]): string => memberNames(members).join(", ");

export function readOnlyLine(channel: Pick<Channel, "kind" | "name" | "members">, me: string | undefined): string {
  if (channel.kind === "dm") return `You are only reading the ${channelLabel(channel)}. ${DM_TAKES_NO_MORE}`;
  return `You are only reading ${roomLabel(channel.name)}. To join it, run: ${addToRoom(channel.name, me)}`;
}

export const earlierMessages = (count: number, threadId: string): string =>
  `${String(count)} earlier ${count === 1 ? "message is" : "messages are"} not shown. Read them with: shrimpy read ${oneLine(threadId)}`;
export const earlierItems = (address: string, agent: string): string =>
  `Earlier items are not shown. Read the whole session with: shrimpy sessions read ${shellWord(oneLine(address))} --agent ${shellWord(oneLine(agent))}`;

/** Whom an agent or thread is waiting on: by name, or as a count where a row has no room for the names. */
export function waitingOnLine(names: readonly string[], full: boolean): string {
  const clean = names.map(oneLine);
  if (clean.length === 0) return "";
  return full || clean.length === 1 ? `waiting on ${listed(clean)}` : `waiting on ${countOf(clean.length, "agent")}`;
}

function whereWords(sessions: SessionSummary[], me: string | undefined): string {
  const [only] = sessions;
  if (only === undefined || sessions.length > 1) return `${String(sessions.length)} sessions`;
  return only.place === null ? "another session" : placeLabel(only.place, me);
}

export function agentDetail(sessions: number, elsewhere: SessionSummary[], me: string | undefined): string {
  if (sessions === 0) return "idle";
  if (elsewhere.length === 0) return "working";
  return `working · ${sessions === 1 ? whereWords(elsewhere, me) : `${String(sessions)} sessions`}`;
}

const QUEUED_CHARACTERS = 200;

const QUEUED: Record<QueuedInput["when"], string> = {
  next_step: "queued for the next step",
  next_turn: "queued for the next turn",
  other: "queued",
};

export function queuedLine(input: QueuedInput): string {
  const text = shortLine(input.text, QUEUED_CHARACTERS);
  return `${QUEUED[input.when]}: ${text}`;
}

export function workingLine(names: string[], activity: SessionActivity | undefined, inThread: boolean, counted = false): string {
  const each = names.map(oneLine);
  const who = counted ? `${String(names.length)} agents` : each.length > 3 ? upTo(each, 2).join(", ") : listed(each);
  const verb = names.length > 1 ? "are" : "is";
  const doing = activity === undefined || activity.kind === "idle" || activity.kind === "working" ? undefined : activityWords(activity);
  return `${who} ${verb} working${doing === undefined ? "" : ` · ${doing}`}${inThread ? ` · write /${STOP} to stop` : ""}`;
}

export interface SaidPart {
  text: string;
  command: boolean;
}

const THREAD_COMMANDS = [...new Set([...commandNames("dm"), ...commandNames("room")])];
const COMMAND = new RegExp(`(?<=: )shrimpy [^,]*?(?=\\.?$|, )|(?<=^|\\s)(?:${THREAD_COMMANDS.join("|")})(?=$|[\\s.,:;])`, "g");

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

export const CLIENT_COMMAND_LINES = {
  archive: { dm: ARCHIVES, room: ARCHIVES },
  cancel: { dm: CANCEL, room: CANCEL },
  devices: { dm: DEVICES, room: DEVICES },
  drop: { dm: DROP, room: DROP },
  kill: { dm: KILL, room: KILL },
  pause: { dm: PAUSE, room: PAUSE },
  rename: { dm: RENAMES, room: RENAMES },
  resume: { dm: RESUME, room: RESUME },
  status: {
    dm: "Show what the agent is doing, its model, tokens, cost, and what is still going.",
    room: "Show which agents here are running and working, and what is still going.",
  },
  unarchive: { dm: UNARCHIVES, room: UNARCHIVES },
  update: { dm: UPDATE, room: UPDATE },
} as const satisfies Record<ClientCommand, { dm: string; room: string }>;

export const defaultModelLine = (agent: string, model: ModelId): string => `${oneLine(agent)}'s model: ${modelWords(model)}`;

const chosenFor = (agent: string, defaultModel: ModelId | undefined): string =>
  defaultModel === undefined
    ? " (chosen for this thread)"
    : ` (chosen for this thread; ${agent}'s default is ${modelWords(defaultModel)})`;

export const statusHeader = (at: number, what: "status" | "devices" = "status"): string => `${what} · shown only to you · read ${localTime(at)}`;

const howMany = (count: number): string => (count === 0 ? "none" : String(count));

export function agentStatusRows(status: AgentStatus, at: number): string[] {
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
  for (const proc of status.processes) {
    rows.push(`Runs in the background, for ${elapsedOf(proc.startedAt, at)}: $ ${oneLine(proc.command)} (${oneLine(proc.id)})`);
  }
  for (const { watch, running } of status.watches) {
    const down = running ? "" : `, and ${oneLine(watch.onAgentName)} is not running`;
    rows.push(`Waits on ${oneLine(watch.onAgentName)} since ${localTime(watch.startedAt)}${down}`);
  }
  for (const trigger of status.session?.onceTriggers ?? []) {
    rows.push(`Once at ${localTime(trigger.due)}: ${onceTriggerPrompt(trigger)}`);
  }
  for (const trigger of status.standingTriggers) {
    const next = trigger.next === null ? "paused" : `next ${localTime(trigger.next)}`;
    rows.push(`Trigger ${oneLine(trigger.name)}, ${describeSchedule(trigger.schedule)}, ${next}`);
  }
  if (status.othersWorking !== undefined) rows.push(`Other sessions working: ${howMany(status.othersWorking)}`);
  return rows;
}

export function devicesRows(status: DevicesStatus): string[] {
  if (status.devices.length === 0) {
    return ["You have no devices. Another machine of yours joins with the line that shrimpy invite prints, run there."];
  }
  return [
    ...status.devices.map((device) => (device.label === null ? oneLine(device.id) : `${oneLine(device.label)} · ${oneLine(device.id)}`)),
    `To take one back, write ${TAKE_BACK}. It is let go at once.`,
  ];
}

export function roomStatusRows(status: RoomStatus, at: number): string[] {
  const rows =
    status.agents.length === 0
      ? ["No agent is in this room."]
      : status.agents.map(
          (agent) =>
            `${oneLine(agent.name)} · ${agent.running ? "running" : NOT_RUNNING} · ${agent.working ? "working in this thread" : "not working in this thread"}`,
        );
  for (const { agent, process } of status.processes) {
    rows.push(`${oneLine(agent)} runs in the background, for ${elapsedOf(process.startedAt, at)}: $ ${oneLine(process.command)} (${oneLine(process.id)})`);
  }
  for (const { agent, watch, running } of status.watches) {
    const down = running ? "" : `, and ${oneLine(watch.onAgentName)} is not running`;
    rows.push(`${oneLine(agent)} waits on ${oneLine(watch.onAgentName)} since ${localTime(watch.startedAt)}${down}`);
  }
  for (const { agent, trigger } of status.onceTriggers) {
    rows.push(`${oneLine(agent)}: once at ${localTime(trigger.due)}: ${onceTriggerPrompt(trigger)}`);
  }
  for (const { agent, trigger } of status.standingTriggers) {
    const next = trigger.next === null ? "paused" : `next ${localTime(trigger.next)}`;
    rows.push(`${oneLine(agent)}: trigger ${oneLine(trigger.name)}, ${describeSchedule(trigger.schedule)}, ${next}`);
  }
  return rows;
}

export const OUT_OF_DATE = "out of date";
export const OUT_OF_DATE_MARK = `(${OUT_OF_DATE})`;
export const toolCallsShown = (full: boolean): string => `tool calls: ${full ? "full" : "brief"}`;
export const thinkingShown = (full: boolean): string => `thinking: ${full ? "full" : "brief"}`;
export const THINKING = "thinking";
export const hiddenSteps = (count: number): string => `${String(count)} earlier ${count === 1 ? "step" : "steps"} not shown`;
export const hiddenLines = (count: number): string => `${String(count)} earlier ${count === 1 ? "line" : "lines"}`;
export const hiddenCharacters = (count: number): string => `${String(count)} earlier ${count === 1 ? "character" : "characters"} not shown`;
export const moreCharacters = (count: number): string => `${String(count)} more ${count === 1 ? "character" : "characters"} not shown`;

export function answerNote(ended: AnswerEnding | undefined): string | undefined {
  const words = endingWords(ended);
  return words === undefined ? undefined : `answer ${words}`;
}

export interface InFull {
  toolCalls: boolean;
  thinking: boolean;
}

export const nextTry = (seconds: number): string => `next try in ${String(seconds)}s`;
export const writeTo = (who: string): string => `Write to ${oneLine(who)}`;
export const EMPTY = "(empty)";

export const homeNote = (agent: string, problem: Problem, self: string): string =>
  `Could not read the home of ${oneLine(agent)}: ${because({ kind: "agent", name: agent }, problem, self)}.`;

export const processOutputNote = (agent: string, problem: Problem, self: string): string =>
  `Could not read output from ${oneLine(agent)}: ${because({ kind: "agent", name: agent }, problem, self)}.`;

export const noTriggers = (agent: string, admins: string[]): string =>
  `${oneLine(agent)} has no triggers. Ask it to make one${admins.length === 0 ? "" : `, or ask ${listed(admins.map(oneLine), "or")}`}.`;

export const FACTS = { state: "state", admin: "admin", machine: "machine", model: "model", version: "version", home: "home" } as const;
export const TURNED_AWAY_FOR_RELEASE = "turned away for its release";
export const workingAt = (places: readonly string[]): string => (places.length === 0 ? "working" : `working · ${listed(places.map(oneLine))}`);
export const yesNo = (yes: boolean): string => (yes ? "yes" : "no");

export const machineLine = (machine: Machine, gateways: boolean, lastLinked: string | undefined): string =>
  [oneLine(machine.system), `user ${oneLine(machine.account)}`, gateways ? "the gateway's machine" : undefined, lastLinked === undefined ? undefined : `last linked at ${lastLinked}`]
    .filter((part) => part !== undefined)
    .join(" · ");

export function notLinkedNote(agent: string, host: string | undefined, start: string): string {
  const said = `${oneLine(agent)} is not linked to the gateway, so its triggers and its home can't be read.`;
  return host === undefined ? `${said} ${start}` : `${said} It lives on ${oneLine(host)}: start it there.`;
}

export const turnedAwayNote = (why: string): string => `${why} Until then its triggers and its home can't be read.`;

export function triggerWhen(trigger: Pick<TriggerSummary, "next" | "last" | "lastCheck">, now: number): string {
  const next = trigger.next === null ? "off" : `next ${whenOf(trigger.next, now)}`;
  const last =
    trigger.last !== null ? `last: ${lastWords(trigger.last, whenOf(trigger.last.firedAt, now))}` : trigger.lastCheck === null ? "not run yet" : "no occurrence yet";
  return `${next} · ${last}`;
}

const PLATFORMS = ["iPhone", "iPad", "Android", "Mac", "Windows", "Linux"];

export function browserLabel(userAgent: string): string {
  const platform = PLATFORMS.find((name) => userAgent.includes(name));
  return platform === undefined ? "a browser" : `a browser on ${platform}`;
}

export const unreadableJoin = (status: number): string =>
  `The gateway answered the invitation's code with something this page can't read (HTTP ${String(status)}). Reload the page, or ask for a new invitation.`;

export const SOMETHING_NEW = "Something new in Shrimpy";

export const notificationTitle = (from: string, room: string | null): string =>
  room === null ? oneLine(from) : `${oneLine(from)} in ${roomLabel(room)}`;
