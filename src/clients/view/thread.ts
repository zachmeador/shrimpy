import { activityWords, modelWords, wakeupNote, YOUR_DM } from "../../contracts/agent/index.ts";
import { type Message, namer, receiptWords, titleOf } from "../../contracts/chat/index.ts";
import { oneLine, plain } from "../../lib/plain/index.ts";
import { agentNameOf, agentOfList, type Model, sidesOf, type Status } from "../state/index.ts";
import { type CommandLine, commandLines } from "./commands.ts";
import { BRIEF, type LevelOptions, lookingAt, OUTPUT_LINES } from "./level.ts";
import { type Look, lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { whenOf } from "./time.ts";
import { type Shown, type Work, workOf } from "./work.ts";
import {
  agentStatusRows,
  DELETED,
  devicesRows,
  earlierMessages,
  editedAt,
  type InFull,
  membersLine,
  newRoomThreadHint,
  newThreadHint,
  queuedLine,
  reactionsLine,
  READ_ONLY_TAG,
  readOnlyLine,
  roomStatusRows,
  statusHeader,
  stopCancelsAll,
  THREAD_EMPTY,
  threadCalled,
  threadTitle,
  wakeupLine,
  workingLine,
} from "./words.ts";

/** One message of a thread, as it now stands. */
export interface MessageRow {
  /** The message's ID, which is a key and is never shown. */
  id: string;
  who: string;
  /** An agent wrote it. */
  agent: boolean;
  /** How the agent that wrote it looks. */
  look: Look | undefined;
  when: string;
  /** What marks it as edited, with when, or nothing if it never was. */
  edited: string | undefined;
  /** It was deleted, and `text` says so. */
  deleted: boolean;
  text: string;
  /** The emoji on it and who put them there, or nothing when there are none. */
  reactions: string | undefined;
  /** What the agents did with it, where that is worth saying: failed, stopped, skipped. */
  notes: string[];
}

/** What `/status` read, as lines: the first says it is for the person alone and when it was read. */
export interface StatusBlock {
  header: string;
  rows: string[];
}

/** What one agent in the thread is doing, step by step, while its session behind the thread works. */
export interface AgentWork {
  /** The agent's member ID. */
  agent: string;
  name: string;
  look: Look;
  work: Work;
  /** What the agent is doing there: working, answering, running a tool. */
  doing: string;
  /** The work shown may be out of date: the agent is not being reached. */
  stale: boolean;
}

/** A wake-up an agent waits on in the thread. */
export interface Waiting {
  /** The member ID of the agent that waits on it. */
  agent: string;
  look: Look;
  /** The agent's name. */
  who: string;
  /** When it comes. */
  when: string;
  /** The note it brings. */
  note: string;
  /** Who waits, when it comes and the note it brings, and, where the person can write and it is the only one, how to cancel it. */
  line: string;
}

/** The third level: the open thread. */
export interface ThreadLevel {
  title: string;
  /** What the conversation is called: the agent's name, or the room's or the channel's label. */
  who: string;
  /** What the thread itself is called, as `title` has it after `who`. */
  called: string;
  /** How the agent looks, in the person's DM with it. */
  look: Look | undefined;
  /**
   * The line under the title, in parts a client sets apart: in the person's DM
   * that it is theirs, then the model the thread has of its own, if it has one;
   * in a room every member's name; in a DM between two agents that it is only
   * read. Empty while the channel is not known.
   */
  sub: string[];
  /** Said when there are older messages than the ones shown, or when there are none to show. */
  lead: string | undefined;
  messages: MessageRow[];
  /** Who is working in the thread, and, where one agent is, what it is doing: the line that goes with the work. Absent when no one is. */
  working: string | undefined;
  /** The same with how many agents in place of their names, for where the names don't fit. Absent unless several are working. */
  workingCounted: string | undefined;
  /** The member ID of the agent whose list the thread was opened from, if it was opened from an agent's. */
  from: string | undefined;
  /** What each agent in the thread is doing, while its session behind the thread works: the agent it was opened from first, then by name. */
  works: AgentWork[];
  /** Every wake-up an agent in the thread waits on there, the soonest first, while the agent is reached. */
  waiting: Waiting[];
  /** What `/stop` does to the wake-ups, said once under all of them where there are several and the person can write. */
  cancels: string | undefined;
  /** The input the sessions behind the thread have accepted and not picked up yet, a line each, while their agents are reached. */
  queued: string[];
  /** Every command the person can write here, in order of name, each with what it does here. None in a channel they only read. */
  commands: CommandLine[];
  /** Said where the input would be when the person only reads the channel: that they do, and why they can't write there. */
  readOnly: string | undefined;
  /** The person only reads the channel, and it is a room, which they can join. */
  joinable: boolean;
  /** What `/status` read as it stood then, from the person's asking until they send a message or open something. */
  status: StatusBlock | undefined;
  /** The person can write here: in their DM with an agent, or in a room they are in. */
  writable: boolean;
  /** An agent in the thread has a session behind it, whose view of it can be on show in place of the conversation. */
  turnable: boolean;
  /** What is not working, or has just gone wrong, most pressing first. */
  notes: string[];
}

export interface ThreadOptions extends LevelOptions {
  /** What is shown in full where work is shown. Everything is brief when this is left out. */
  inFull?: InFull;
  /** How many of a tool's last lines a brief call shows. */
  outputLines?: number;
}

/** The open thread, as plain text and facts, or none while no thread is open. */
export function threadLevel(model: Model, options: ThreadOptions): ThreadLevel | undefined {
  const { item } = model.open;
  if (item?.kind !== "thread") return undefined;
  const { now } = options;
  const { place, thread: threadId } = item;
  const here = lookingAt(model, place);
  const live = threadId !== undefined && model.thread?.thread.id === threadId ? model.thread : undefined;
  const listed = threadId === undefined ? undefined : here.threads.find((thread) => thread.id === threadId);
  const thread = live?.thread ?? listed;
  // A thread can be shown before its channel is known, so the messages' authors name members too. The channel's members
  // come last, so theirs are the names used.
  const known = namer([...(model.thread?.messages ?? []).map((message) => message.author), ...(here.channel?.members ?? [])]);
  const names = (memberId: string): string => oneLine(known(memberId));
  // The agent whose list the thread was opened from has its work beside the conversation, from its session behind the
  // thread. A room's own threads have none: the marks chat keeps say who is working.
  const from = agentOfList(model.open);
  const dm = place.kind === "agent";
  // The person writes in their DM with an agent and in a room they are in, and in no other channel.
  const reading = place.kind === "read-only";
  const who = here.label;

  const messages = (live?.messages ?? []).map((message) => messageRow(message, model, names, now));
  // A session that was working when the agent went away is not working now, whatever its last view says.
  const busy = (agent: string): boolean => model.behind[agent]?.status.busy === true && model.behind[agent].reached;
  const nameOf = (agent: string): string => (known(agent) === agent ? oneLine(agentNameOf(model, agent)) : names(agent));
  // Who is working in the thread: each agent that chat marks there, or whose session behind it works.
  const workers = [...new Set([...(thread?.working.map((mark) => mark.memberId) ?? []), ...Object.keys(model.behind).filter(busy)])]
    .map((agent) => ({ agent, name: nameOf(agent) }))
    .sort((a, b) => Number(b.agent === from) - Number(a.agent === from) || a.name.localeCompare(b.name));
  // What the work is doing is said where one agent works, from its session.
  const [only] = workers;
  const activity = only !== undefined && workers.length === 1 && busy(only.agent) ? model.behind[only.agent]?.status.activity : undefined;
  const workerNames = workers.map((each) => each.name);
  const working = workers.length === 0 ? undefined : workingLine(workerNames, activity, !reading);
  const workingCounted = workers.length < 2 ? undefined : workingLine(workerNames, activity, !reading, true);
  const dmSession = dm ? model.behind[place.id]?.status : undefined;

  let lead: string | undefined;
  if (threadId === undefined) lead = reading ? undefined : dm ? newThreadHint(who) : newRoomThreadHint(here.name);
  else if (live !== undefined && live.earlier > 0) lead = earlierMessages(live.earlier, threadId);
  else if (live !== undefined && messages.length === 0) lead = THREAD_EMPTY;

  let sub: string[] = [];
  if (dm) sub = [YOUR_DM, ...(dmSession?.ownModel === true && dmSession.model !== null ? [modelWords(dmSession.model)] : [])];
  else if (here.channel?.kind === "dm") sub = [READ_ONLY_TAG];
  else if (here.channel !== undefined) sub = [membersLine(here.channel.members)];

  const waiting = waitingOf(model, now, !reading);
  const [soonest] = waiting;
  const called = threadCalled(thread === undefined ? threadId : titleOf(thread));
  return {
    title: threadTitle(who, called),
    who,
    called,
    look: dm ? lookOf(model, place.id) : undefined,
    sub,
    lead,
    messages,
    working,
    workingCounted,
    from,
    works: worksOf(model, from, { inFull: options.inFull ?? BRIEF, outputLines: options.outputLines ?? OUTPUT_LINES }),
    waiting,
    cancels: reading || soonest === undefined || waiting.length < 2 ? undefined : stopCancelsAll(waiting.length, dm ? "dm" : "room", dm ? who : soonest.who),
    queued: queuedOf(model),
    commands: reading ? [] : commandLines(dm ? "dm" : "room"),
    readOnly: reading && here.channel !== undefined ? readOnlyLine(here.channel, model.me?.name) : undefined,
    joinable: reading && here.channel?.kind === "room",
    status: model.status === undefined ? undefined : statusBlock(model.status),
    writable: !reading,
    turnable: sidesOf(model).length > 0,
    notes: notesOf(model, { agent: from, watching: false, looking: "work", refused: undefined, notice: true }, options.self),
  };
}

/**
 * What each agent in the open thread is doing, while its session behind the
 * thread works as its last view says: the agent the thread was opened from
 * first, then by name.
 */
function worksOf(model: Model, from: string | undefined, shown: Shown): AgentWork[] {
  return Object.entries(model.behind)
    .flatMap(([agent, view]) => {
      const work = workOf(view, shown);
      if (work === undefined) return [];
      return [{ agent, name: oneLine(agentNameOf(model, agent)), look: lookOf(model, agent), work, doing: activityWords(view.status.activity), stale: !view.reached }];
    })
    .sort((a, b) => Number(b.agent === from) - Number(a.agent === from) || a.name.localeCompare(b.name));
}

/**
 * Every wake-up an agent in the open thread waits on there, the soonest first,
 * of each agent that is reached. `inThread` says that the person can write
 * where it is shown, where `/stop` cancels it.
 */
function waitingOf(model: Model, now: number, inThread: boolean): Waiting[] {
  const all = Object.entries(model.behind)
    .flatMap(([agent, view]) => (view.reached ? view.status.wakeups.map((wakeup) => ({ agent, wakeup })) : []))
    .sort((a, b) => a.wakeup.due - b.wakeup.due);
  // What `/stop` does to a wake-up is said on the one there is. Of several, `/status` lists them all and says it once.
  return all.map(({ agent, wakeup }) => {
    const who = oneLine(agentNameOf(model, agent));
    const when = whenOf(wakeup.due, now);
    return { agent, look: lookOf(model, agent), who, when, note: wakeupNote(wakeup), line: wakeupLine(who, wakeup, when, inThread && all.length === 1) };
  });
}

/**
 * The input the sessions behind the open thread have accepted and not picked
 * up yet, of each agent that is reached. The same message waiting in several
 * agents' sessions is one line.
 */
function queuedOf(model: Model): string[] {
  const lines = Object.values(model.behind).flatMap((view) => (view.reached ? view.status.queued.map(queuedLine) : []));
  return [...new Set(lines)];
}

function statusBlock(status: Status): StatusBlock {
  const { about } = status;
  switch (about.kind) {
    case "agent":
      return { header: statusHeader(status.at), rows: agentStatusRows(about) };
    case "room":
      return { header: statusHeader(status.at), rows: roomStatusRows(about) };
    case "devices":
      return { header: statusHeader(status.at, "devices"), rows: devicesRows(about) };
  }
}

function messageRow(message: Message, model: Model, names: (memberId: string) => string, now: number): MessageRow {
  return {
    id: message.id,
    who: oneLine(message.author.name),
    agent: message.author.kind === "agent",
    look: message.author.kind === "agent" ? lookOf(model, message.author.id) : undefined,
    when: whenOf(message.sentAt, now),
    edited: message.editedAt === null || message.deleted ? undefined : editedAt(whenOf(message.editedAt, now)),
    deleted: message.deleted,
    text: message.deleted ? DELETED : plain(message.text).trimEnd(),
    reactions: reactionsLine(message.reactions.map((reaction) => ({ emoji: reaction.emoji, by: reaction.memberIds.map(names) }))),
    notes: message.receipts.flatMap((receipt) => receiptWords(receipt, names(receipt.memberId)) ?? []),
  };
}
