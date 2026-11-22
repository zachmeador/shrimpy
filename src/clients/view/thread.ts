import { type Message, namer, receiptWords, titleOf } from "../../contracts/chat/index.ts";
import { oneLine, plain } from "../../lib/plain/index.ts";
import { agentNameOf, agentOfList, type Model, type Status } from "../state/index.ts";
import { type CommandLine, commandLines } from "./commands.ts";
import { BRIEF, type LevelOptions, lookingAt } from "./level.ts";
import { notesOf } from "./notes.ts";
import { whenOf } from "./time.ts";
import { type Work, workOf } from "./work.ts";
import {
  agentStatusRows,
  DELETED,
  devicesRows,
  earlierMessages,
  editedAt,
  type InFull,
  newRoomThreadHint,
  newThreadHint,
  reactionsLine,
  readOnlyLine,
  roomStatusRows,
  statusHeader,
  THREAD_EMPTY,
  threadTitle,
  wakeupLine,
  workingLine,
} from "./words.ts";

/** One message of a thread, as it now stands. */
export interface MessageRow {
  /** The message's ID, which is a key and is never shown. */
  id: string;
  who: string;
  /** The message is the person's own. */
  mine: boolean;
  /** An agent wrote it. */
  agent: boolean;
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
  work: Work;
  /** The work shown may be out of date: the agent is not being reached. */
  stale: boolean;
}

/** A wake-up an agent waits on in the thread. */
export interface Waiting {
  /** The member ID of the agent that waits on it. */
  agent: string;
  /** When it comes, the note it brings and, where the person can write, how to cancel it. */
  line: string;
}

/** The third level: the open thread. */
export interface ThreadLevel {
  title: string;
  /** Said when there are older messages than the ones shown, or when there are none to show. */
  lead: string | undefined;
  messages: MessageRow[];
  /** Who is working in the thread, and what the agent it was opened from is doing: the line that goes with the work. Absent when no one is. */
  working: string | undefined;
  /** The member ID of the agent whose list the thread was opened from, if it was opened from an agent's. */
  from: string | undefined;
  /** What each agent in the thread is doing, while its session behind the thread works: the agent it was opened from first, then by name. */
  works: AgentWork[];
  /** Every wake-up an agent in the thread waits on there, the soonest first, while the agent is reached. */
  waiting: Waiting[];
  /** Every command the person can write here, in order of name, each with what it does here. None in a channel they only read. */
  commands: CommandLine[];
  /** Said where the input would be when the person only reads the channel: that they do, and why they can't write there. */
  readOnly: string | undefined;
  /** What `/status` read as it stood then, from the person's asking until they send a message or open something. */
  status: StatusBlock | undefined;
  /** The person can write here: in their DM with an agent, or in a room they are in. */
  writable: boolean;
  /** The agent the thread was opened from has a session behind it, whose view of it can be on show in place of the conversation. */
  turnable: boolean;
  /** What is not working, or has just gone wrong, most pressing first. */
  notes: string[];
}

export interface ThreadOptions extends LevelOptions {
  /** What is shown in full where work is shown. Everything is brief when this is left out. */
  inFull?: InFull;
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
  const fromName = from === undefined ? undefined : agentNameOf(model, from);
  const dm = place.kind === "agent";
  // The person writes in their DM with an agent and in a room they are in, and in no other channel.
  const reading = place.kind === "read-only";
  const who = here.label;

  const messages = (live?.messages ?? []).map((message) => messageRow(message, model, names, now));
  const session = from === undefined ? undefined : model.behind[from];
  const markedWorking = thread?.working.map((mark) => names(mark.memberId)) ?? [];
  // A session that was working when the agent went away is not working now, whatever its last view says.
  const sessionBusy = session?.status.busy === true && session.reached;
  const working =
    markedWorking.length > 0 || sessionBusy
      ? workingLine(markedWorking.length > 0 ? markedWorking : [fromName ?? who], sessionBusy ? session.status.activity : undefined, !reading)
      : undefined;

  let lead: string | undefined;
  if (threadId === undefined) lead = reading ? undefined : dm ? newThreadHint(who) : newRoomThreadHint(here.name);
  else if (live !== undefined && live.earlier > 0) lead = earlierMessages(live.earlier, threadId);
  else if (live !== undefined && messages.length === 0) lead = THREAD_EMPTY;

  return {
    title: threadTitle(who, thread === undefined ? threadId : titleOf(thread)),
    lead,
    messages,
    working,
    from,
    works: worksOf(model, from, options.inFull ?? BRIEF),
    waiting: waitingOf(model, now, !reading),
    commands: reading ? [] : commandLines(dm ? "dm" : "room"),
    readOnly: reading && here.channel !== undefined ? readOnlyLine(here.channel, model.me?.name) : undefined,
    status: model.status === undefined ? undefined : statusBlock(model.status),
    writable: !reading,
    turnable: from !== undefined && threadId !== undefined && model.behind[from] !== undefined,
    notes: notesOf(model, { agent: from, watching: false, looking: "work", refused: undefined, notice: true }, options.self),
  };
}

/**
 * What each agent in the open thread is doing, while its session behind the
 * thread works as its last view says: the agent the thread was opened from
 * first, then by name.
 */
function worksOf(model: Model, from: string | undefined, inFull: InFull): AgentWork[] {
  return Object.entries(model.behind)
    .flatMap(([agent, view]) => {
      const work = workOf(view, inFull);
      return work === undefined ? [] : [{ agent, name: oneLine(agentNameOf(model, agent)), work, stale: !view.reached }];
    })
    .sort((a, b) => Number(b.agent === from) - Number(a.agent === from) || a.name.localeCompare(b.name));
}

/**
 * Every wake-up an agent in the open thread waits on there, the soonest first,
 * of each agent that is reached. `inThread` says that the person can write
 * where it is shown, where `/stop` cancels it.
 */
function waitingOf(model: Model, now: number, inThread: boolean): Waiting[] {
  return Object.entries(model.behind)
    .flatMap(([agent, view]) => (view.reached ? view.status.wakeups.map((wakeup) => ({ agent, wakeup })) : []))
    .sort((a, b) => a.wakeup.due - b.wakeup.due)
    .map(({ agent, wakeup }) => ({ agent, line: wakeupLine(agentNameOf(model, agent), wakeup, whenOf(wakeup.due, now), inThread) }));
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
    mine: message.author.id === model.me?.id,
    agent: message.author.kind === "agent",
    when: whenOf(message.sentAt, now),
    edited: message.editedAt === null || message.deleted ? undefined : editedAt(whenOf(message.editedAt, now)),
    deleted: message.deleted,
    text: message.deleted ? DELETED : plain(message.text).trimEnd(),
    reactions: reactionsLine(message.reactions.map((reaction) => ({ emoji: reaction.emoji, by: reaction.memberIds.map(names) }))),
    notes: message.receipts.flatMap((receipt) => receiptWords(receipt, names(receipt.memberId)) ?? []),
  };
}
