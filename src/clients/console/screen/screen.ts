import type { Channel, Message, Thread } from "../../../contracts/chat/index.ts";
import { agentEntries, type Model, workingIn } from "../state/index.ts";
import { oneLine, plain } from "./plain.ts";
import { whenOf } from "./time.ts";
import { type Work, workOf } from "./work.ts";
import {
  agentNote,
  agentsTitle,
  AGENTS_EMPTY,
  chatNote,
  DELETED,
  editedAt,
  earlierMessages,
  gatewayNote,
  KEYS,
  newThreadHint,
  NO_TITLE,
  noticeText,
  reactionsLine,
  receiptNote,
  THREAD_EMPTY,
  threadsEmpty,
  threadsTitle,
  threadTitle,
  versionWarning,
  workingLine,
} from "./words.ts";

/** A line the person should read, apart from the list or the conversation. */
export interface Note {
  tone: "warn" | "info";
  text: string;
}

/** What every screen has besides its own content. */
interface Chrome {
  /** What is not working, or has just gone wrong, most pressing first. */
  notes: Note[];
  /** The keys that do something here. */
  keys: string;
}

/** A row of a list the person chooses from. */
export interface Row {
  /** What the state is told when the row is chosen: an agent's name, or a thread's ID. It is never shown. */
  id: string;
  label: string;
  detail: string;
  working: boolean;
}

export interface AgentsScreen extends Chrome {
  kind: "agents";
  title: string;
  /** The list may be out of date: the gateway is not being reached. */
  stale: boolean;
  rows: Row[];
  /** What to say instead of an empty list, if there is something to say. */
  empty: string | undefined;
}

export interface ThreadsScreen extends Chrome {
  kind: "threads";
  title: string;
  stale: boolean;
  rows: Row[];
  empty: string | undefined;
}

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

export interface ThreadScreen extends Chrome {
  kind: "thread";
  /**
   * The title does not say when what was said may be out of date: a long
   * conversation has scrolled it away, and changing a line that far up repaints
   * the whole screen. The notes by the editor say so.
   */
  title: string;
  /** Said when there are older messages than the ones shown, or when there are none to show. */
  lead: string | undefined;
  messages: MessageRow[];
  /** Who is working in the thread, and what they are doing: the line that goes with the work. Absent when no one is. */
  working: string | undefined;
  /** What the agent is doing, step by step, while it works. Absent when it is not. */
  work: Work | undefined;
  /** The work shown may be out of date: the agent is not being reached. */
  workStale: boolean;
}

export type Screen = AgentsScreen | ThreadsScreen | ThreadScreen;

export interface ScreenOptions {
  /** The moment it is, in milliseconds since the epoch, for saying when things happened. */
  now: number;
}

/** Everything the console shows for the model, as plain text and facts. Nothing in it can act on a terminal. */
export function screenOf(model: Model, options: ScreenOptions): Screen {
  const { where } = model;
  switch (where.screen) {
    case "agents":
      return agentsScreen(model);
    case "threads":
      return threadsScreen(model, where.agent, options.now);
    case "thread":
      return threadScreen(model, where.agent, where.thread, options.now);
  }
}

function agentsScreen(model: Model): AgentsScreen {
  const rows = agentEntries(model).map((entry) => ({
    id: entry.name,
    label: oneLine(entry.name),
    detail: entry.running ? (entry.working ? "working" : "idle") : "not running",
    working: entry.working,
  }));
  return {
    kind: "agents",
    title: agentsTitle(),
    stale: model.gateway.state === "down" && model.listing !== undefined,
    rows,
    empty: rows.length === 0 && model.gateway.state === "up" && model.listing !== undefined ? AGENTS_EMPTY : undefined,
    notes: notesOf(model, undefined),
    keys: KEYS.agents,
  };
}

function threadsScreen(model: Model, agent: string, now: number): ThreadsScreen {
  const threads = model.dms[agent]?.threads ?? [];
  // Chat's working marks name members by ID, and the agent is the one agent in its DM with the person.
  const agentId = model.dms[agent]?.channel.members.find((member) => member.kind === "agent")?.id;
  const workingHere = (thread: Thread): boolean => agentId !== undefined && workingIn(thread, agentId);
  const rows = threads.map((thread) => ({
    id: thread.id,
    label: titleWithTags(thread),
    detail: [whenOf(thread.updatedAt, now), workingHere(thread) ? "working" : undefined].filter((part) => part !== undefined).join(" · "),
    working: workingHere(thread),
  }));
  return {
    kind: "threads",
    title: threadsTitle(oneLine(agent)),
    stale: model.chat.state === "down",
    rows,
    empty: rows.length === 0 && model.chat.state === "up" ? threadsEmpty(oneLine(agent)) : undefined,
    notes: notesOf(model, agent),
    keys: KEYS.threads,
  };
}

function threadScreen(model: Model, agent: string, threadId: string | undefined, now: number): ThreadScreen {
  const live = threadId !== undefined && model.thread?.thread.id === threadId ? model.thread : undefined;
  const listed = threadId === undefined ? undefined : model.dms[agent]?.threads.find((thread) => thread.id === threadId);
  const thread = live?.thread ?? listed;
  const channel = model.dms[agent]?.channel;
  const names = namer(channel, model);

  const messages = (live?.messages ?? []).map((message) => messageRow(message, model, names, now));
  const session = model.session;
  const markedWorking = thread?.working.map((mark) => names(mark.memberId)) ?? [];
  // A session that was working when the agent went away is not working now, whatever its last view says.
  const sessionBusy = session?.status.busy === true && model.agent?.state !== "down";
  const working =
    markedWorking.length > 0 || sessionBusy
      ? workingLine(markedWorking.length > 0 ? markedWorking : [oneLine(agent)], sessionBusy ? session.status.activity : undefined)
      : undefined;

  let lead: string | undefined;
  if (threadId === undefined) lead = newThreadHint(oneLine(agent));
  else if (live !== undefined && live.earlier > 0) lead = earlierMessages(live.earlier, threadId);
  else if (live !== undefined && messages.length === 0) lead = THREAD_EMPTY;

  return {
    kind: "thread",
    title: threadTitle(oneLine(agent), thread === undefined ? threadId : titleOf(thread)),
    lead,
    messages,
    working,
    work: workOf(session),
    workStale: model.agent?.state === "down",
    notes: notesOf(model, agent),
    keys: KEYS.thread,
  };
}

/** A thread's name, or the start of its first message, or a word saying it has none. */
function titleOf(thread: Thread): string {
  return oneLine(thread.name ?? thread.preview ?? NO_TITLE);
}

function titleWithTags(thread: Thread): string {
  const tags = [thread.main ? "main" : undefined, thread.archived ? "archived" : undefined].filter((tag) => tag !== undefined);
  return tags.length === 0 ? titleOf(thread) : `${titleOf(thread)} [${tags.join(", ")}]`;
}

/** What a member is called, for the IDs that receipts and marks carry. */
function namer(channel: Channel | undefined, model: Model): (memberId: string) => string {
  const known = new Map<string, string>();
  for (const message of model.thread?.messages ?? []) known.set(message.author.id, message.author.name);
  for (const member of channel?.members ?? []) known.set(member.id, member.name);
  return (memberId) => oneLine(known.get(memberId) ?? memberId.replace(/^[^:]*:/, ""));
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
    notes: message.receipts.flatMap((receipt) => receiptNote(receipt, names(receipt.memberId)) ?? []),
  };
}

/**
 * What the person should be told about how things stand. A problem with the
 * gateway comes first, since it explains why the chat server or an agent can't
 * be found; then the others, then a version that differs, then what just
 * happened.
 */
function notesOf(model: Model, agent: string | undefined): Note[] {
  const notes: Note[] = [];
  const warn = (text: string | undefined): void => {
    if (text !== undefined) notes.push({ tone: "warn", text });
  };
  const gatewayDown = model.gateway.state === "down";
  if (model.gateway.state === "down") warn(gatewayNote(model.gateway.why));
  // The gateway being gone is why nothing is registered: that is not worth saying twice.
  if (model.chat.state === "down" && !(gatewayDown && model.chat.why.kind === "not-registered")) warn(chatNote(model.chat.why));
  if (model.where.screen === "thread" && agent !== undefined && model.agent?.state === "down" && !(gatewayDown && model.agent.why.kind === "not-registered")) {
    warn(agentNote(oneLine(agent), model.agent.why));
  }

  warn(model.listing === undefined ? undefined : versionWarning("the gateway", model.listing.version));
  const registered = model.listing?.programs ?? [];
  const chat = registered.findLast((program) => program.kind === "chat");
  warn(chat === undefined ? undefined : versionWarning("the chat server", chat.version));
  const running = agent === undefined ? undefined : registered.findLast((program) => program.kind === "agent" && program.name === agent);
  warn(running === undefined ? undefined : versionWarning(`the agent ${oneLine(agent ?? "")}`, running.version));

  if (model.notice !== undefined) {
    notes.push({ tone: model.notice.kind === "stopped" ? "info" : "warn", text: noticeText(model.notice, oneLine(agent ?? "")) });
  }
  return notes;
}
