import type { Channel, Message, Thread } from "../../../contracts/chat/index.ts";
import {
  agentEntries,
  agentOfThread,
  type Model,
  type Part,
  partsOf,
  type Place,
  readOnlyEntries,
  roomEntries,
  type Status,
  type Where,
} from "../state/index.ts";
import { type CommandLine, commandLines } from "./commands.ts";
import { oneLine, plain } from "./plain.ts";
import { whenOf } from "./time.ts";
import { type Step, type Work, watchOf, workOf } from "./work.ts";
import {
  agentDetail,
  agentNote,
  agentsTitle,
  AGENTS_EMPTY,
  agentStatusRows,
  agentTitle,
  type Can,
  channelLabel,
  channelThreadsTitle,
  chatNote,
  DELETED,
  editedAt,
  earlierItems,
  earlierMessages,
  gatewayNote,
  idleLine,
  type InFull,
  keyHints,
  type ListFilter,
  newRoomThreadHint,
  newThreadHint,
  NO_TITLE,
  noticeText,
  placeLabel,
  placeWords,
  queuedLine,
  readOnlyDetail,
  readOnlyLine,
  reactionsLine,
  receiptNote,
  refusalNote,
  roomLabel,
  roomStatusRows,
  SESSION_EMPTY,
  sessionTitle,
  statusHeader,
  THREAD_EMPTY,
  threadsEmpty,
  threadTitle,
  threadWords,
  versionWarning,
  workingLine,
  YOUR_DM,
} from "./words.ts";

/** What every screen has besides its own content. */
interface Chrome {
  /** What is not working, or has just gone wrong, most pressing first. Each is a line the person should read, apart from the list or the conversation. */
  notes: string[];
  /** The line of keys, one hint to an item: every key that does something here, with what it does. */
  keys: string[];
  /** What the keys that depend on the screen do here. `keys` is made from it. */
  can: Can;
}

/** A row of a list the person chooses from. */
export interface Row {
  /** What the state is told when the row is chosen: an agent's name, the channel ID of a room or of a channel only read, a thread's ID or the address of a session behind no thread. It is never shown. */
  id: string;
  /** What choosing it opens: a thread is opened as the conversation it is, and a session as the agent's view of it. */
  kind: "agent" | "room" | "read-only" | "thread" | "session";
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

/**
 * The threads of a room or of a channel only read, or, on an agent's screen,
 * everything the agent takes part in, newest first.
 */
export interface ThreadsScreen extends Chrome {
  kind: "threads";
  title: string;
  /** The list may be out of date: chat is not being reached, or the agent is, and what it last said is shown. */
  stale: boolean;
  rows: Row[];
  empty: string | undefined;
  /** This is an agent's screen, and not a room's or a channel's. */
  ofAgent: boolean;
  /** Everything that will be listed is in: on an agent's screen, the agent has said which sessions it has. */
  settled: boolean;
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

/** What `/status` read, as lines: the first says it is for the person alone and when it was read. */
export interface StatusBlock {
  header: string;
  rows: string[];
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
  /** Every command the person can write here, in order of name, each with what it does here. The editor lists them while the text starts with a slash. None in a channel they only read. */
  commands: CommandLine[];
  /** Said where the input would be when the person only reads the channel: that they do, and why they can't write there. There is no input then. */
  readOnly: string | undefined;
  /** What `/status` read as it stood then, from the person's asking until they send a message or leave. It goes between the messages and the editor. */
  status: StatusBlock | undefined;
}

/**
 * One of an agent's sessions, as the agent sees it: a trigger's own, or the one
 * behind a thread, turned over from it. It is for watching: nothing is said or
 * done in it.
 */
export interface SessionScreen extends Chrome {
  kind: "session";
  /**
   * As for a thread, the title does not say when what is shown may be out of
   * date: a long session has scrolled it away. The notes at the bottom say so.
   */
  title: string;
  /** Said when there are older items than the ones shown, or when there are none to show. */
  lead: string | undefined;
  /** The newest items of the session, oldest first: what it was shown, what it thought and wrote, and each tool call. */
  steps: Step[];
  /** What the session is doing now, when it is working. */
  working: string | undefined;
  /** Said when the session is not working. */
  idle: string | undefined;
  /** The input it has accepted and not picked up yet, a line each. */
  queued: string[];
  /** What is shown may be out of date: the agent is not being reached. */
  stale: boolean;
}

export type Screen = AgentsScreen | ThreadsScreen | ThreadScreen | SessionScreen;

export interface ScreenOptions {
  /** The moment it is, in milliseconds since the epoch, for saying when things happened. */
  now: number;
  /** What is shown in full where work is shown. Everything is brief when this is left out. */
  inFull?: InFull;
  /** What the list on an agent's screen shows. Everything when this is left out. */
  filter?: ListFilter;
}

const BRIEF: InFull = { toolCalls: false, thinking: false };

/** Everything the console shows for the model, as plain text and facts. Nothing in it can act on a terminal. */
export function screenOf(model: Model, options: ScreenOptions): Screen {
  const { where } = model;
  const inFull = options.inFull ?? BRIEF;
  switch (where.screen) {
    case "agents":
      return agentsScreen(model, inFull);
    case "threads":
      return where.place.kind === "agent"
        ? agentScreen(model, where.place.name, options.filter ?? "everything", options.now, inFull)
        : threadsScreen(model, where.place, options.now, inFull);
    case "thread": {
      const agent = agentOfThread(where);
      return where.turned === true && where.thread !== undefined && agent !== undefined
        ? turnedScreen(model, where, agent, where.thread, inFull)
        : threadScreen(model, where, options.now, inFull);
    }
    case "session":
      return sessionScreen(model, where.agent, where.session, inFull);
  }
}

function agentsScreen(model: Model, inFull: InFull): AgentsScreen {
  const can: Can = { back: false, send: false, newThread: false, filter: false, turnOver: false, work: false };
  const agents: Row[] = agentEntries(model).map((entry) => ({
    id: entry.name,
    kind: "agent",
    label: oneLine(entry.name),
    detail: entry.running ? agentDetail(entry.sessions, entry.elsewhere, model.me?.name) : "not running",
    working: entry.working,
  }));
  const rooms: Row[] = roomEntries(model).map((entry) => ({
    id: entry.id,
    kind: "room",
    label: roomLabel(entry.name),
    detail: [entry.members.map(oneLine).join(", "), entry.working ? "working" : undefined].filter((part) => part !== undefined && part !== "").join(" · "),
    working: entry.working,
  }));
  // The rooms the person is not in come last, apart from their own.
  const reading: Row[] = readOnlyEntries(model).map(({ channel, working }) => ({
    id: channel.id,
    kind: "read-only",
    label: channelLabel(channel),
    detail: readOnlyDetail(channel, working),
    working,
  }));
  const rows = [...agents, ...rooms, ...reading];
  return {
    kind: "agents",
    title: agentsTitle(),
    stale: model.gateway.state === "down" && model.listing !== undefined,
    rows,
    empty: rows.length === 0 && model.gateway.state === "up" && model.listing !== undefined ? AGENTS_EMPTY : undefined,
    notes: notesOf(model, undefined),
    keys: keyHints("agents", can, inFull),
    can,
  };
}

/** The channel whose threads the person looks at, or that a thread is in: their DM with an agent, a room, or a channel they only read. */
interface Looking {
  /** The agent's name, or the room's. */
  name: string;
  /** What the conversation is called on screen: the agent's name, or the room's or the channel's label. */
  label: string;
  channel: Channel | undefined;
  threads: Thread[];
}

function lookingAt(model: Model, place: Place): Looking {
  if (place.kind === "agent") {
    const dm = model.dms[place.name];
    return { name: place.name, label: oneLine(place.name), channel: dm?.channel, threads: dm?.threads ?? [] };
  }
  const found = place.kind === "room" ? model.rooms[place.id] : model.readOnly[place.id];
  return {
    name: found?.channel.name ?? place.id,
    label: found === undefined ? roomLabel(place.id) : channelLabel(found.channel),
    channel: found?.channel,
    threads: found?.threads ?? [],
  };
}

/** The threads of a room the person is in, or of a room they only read. */
function threadsScreen(model: Model, place: Exclude<Place, { kind: "agent" }>, now: number, inFull: InFull): ThreadsScreen {
  const here = lookingAt(model, place);
  // A channel the person only reads takes no new thread.
  const can: Can = { back: true, send: false, newThread: place.kind !== "read-only", filter: false, turnOver: false, work: false };
  const rows: Row[] = here.threads.map((thread) => ({
    id: thread.id,
    kind: "thread",
    label: titleWithTags(thread),
    detail: [whenOf(thread.updatedAt, now), thread.working.length > 0 ? "working" : undefined].filter((part) => part !== undefined).join(" · "),
    working: thread.working.length > 0,
  }));
  return {
    kind: "threads",
    title: channelThreadsTitle(here.label),
    stale: model.chat.state === "down",
    rows,
    // A room always has its main thread, so there is no one to ask the person to start a talk with.
    empty: undefined,
    ofAgent: false,
    settled: true,
    notes: notesOf(model, undefined),
    keys: keyHints("threads", can, inFull),
    can,
  };
}

/**
 * An agent's screen: everything the agent takes part in as one list, or only
 * what is with the person. What the agent says of its sessions is a part of the
 * list, so it is as stale as the agent is out of reach.
 */
function agentScreen(model: Model, agent: string, filter: ListFilter, now: number, inFull: InFull): ThreadsScreen {
  const can: Can = { back: true, send: false, newThread: true, filter: true, turnOver: false, work: false };
  const parts = partsOf(model, agent);
  const rows = parts.filter((part) => filter === "everything" || part.yours).map((part) => partRow(part, model.me?.name, now));
  const listed = model.sessions !== undefined;
  return {
    kind: "threads",
    title: agentTitle(agent, filter),
    stale: model.chat.state === "down" || (model.agent?.state === "down" && listed),
    rows,
    empty: rows.length === 0 && model.chat.state === "up" ? threadsEmpty(agent, parts.length > 0) : undefined,
    ofAgent: true,
    settled: listed,
    notes: notesOf(model, agent),
    keys: keyHints("threads", can, inFull),
    can,
  };
}

/**
 * The row for something an agent takes part in: what it is called, then where it
 * is, when it was last active and whether the agent is working there. A
 * session behind no thread is called for where it is, and has no time.
 */
function partRow(part: Part, me: string | undefined, now: number): Row {
  const where = part.yours ? YOUR_DM : part.place === null ? undefined : placeLabel(part.place, me);
  const working = part.working ? "working" : undefined;
  if (part.kind === "session") {
    return { id: part.id, kind: "session", label: where ?? oneLine(part.id), detail: working ?? "", working: part.working };
  }
  // Chat names a thread. A thread only the agent has said it has is called what the agent knows of it.
  let label = oneLine(part.id);
  if (part.thread !== undefined) label = titleWithTags(part.thread);
  else if (part.place !== null && part.place.kind !== "trigger") label = threadWords(part.place.thread, part.id);
  const when = part.at === undefined ? undefined : whenOf(part.at, now);
  return {
    id: part.id,
    kind: "thread",
    label,
    detail: [where, when, working].filter((each) => each !== undefined).join(" · "),
    working: part.working,
  };
}

function sessionScreen(model: Model, agent: string, address: string, inFull: InFull): SessionScreen {
  const summary = model.sessions?.find((each) => each.id === address);
  const title = sessionTitle(agent, placeWords(summary?.place ?? null, address, model.me?.name));
  return sessionScreenOf(model, agent, address, title, false, inFull);
}

type ThreadWhere = Extract<Where, { screen: "thread" }>;

/**
 * A thread turned over: the session behind it as `agent` sees it, titled for the
 * thread, with Tab to turn it back.
 */
function turnedScreen(model: Model, where: ThreadWhere, agent: string, threadId: string, inFull: InFull): SessionScreen {
  const here = lookingAt(model, where.place);
  const thread = (model.thread?.thread.id === threadId ? model.thread.thread : undefined) ?? here.threads.find((each) => each.id === threadId);
  const named = thread === undefined ? oneLine(threadId) : titleOf(thread);
  // The title of a DM with the agent already has the agent's name in it, and any other conversation is named.
  const title = sessionTitle(agent, where.place.kind === "agent" ? named : `${here.label} · ${named}`);
  return sessionScreenOf(model, agent, threadId, title, true, inFull);
}

/** A session as `agent` sees it, by its address. `turnOver` is whether it is a thread's, turned over, and so can be turned back. */
function sessionScreenOf(model: Model, agent: string, address: string, title: string, turnOver: boolean, inFull: InFull): SessionScreen {
  const can: Can = { back: true, send: false, newThread: false, filter: false, turnOver, work: true };
  const view = model.session;
  // A session that was working when the agent went away is not working now, whatever its last view says.
  const stale = model.agent?.state === "down";
  const busy = view?.status.busy === true && !stale;
  const watched = view === undefined ? undefined : watchOf(view, inFull);

  let lead: string | undefined;
  if (watched !== undefined && watched.earlier > 0) lead = earlierItems(watched.earlier, address, agent);
  else if (view !== undefined && view.items.length === 0) lead = SESSION_EMPTY;

  return {
    kind: "session",
    title,
    lead,
    steps: watched?.steps ?? [],
    working: busy ? workingLine([agent], view.status.activity, false) : undefined,
    idle: view !== undefined && !busy && !stale ? idleLine(agent) : undefined,
    queued: view?.status.queued.map(queuedLine) ?? [],
    stale: view !== undefined && stale,
    notes: notesOf(model, agent),
    keys: keyHints("session", can, inFull),
    can,
  };
}

function threadScreen(model: Model, where: ThreadWhere, now: number, inFull: InFull): ThreadScreen {
  const { place, thread: threadId } = where;
  const here = lookingAt(model, place);
  const live = threadId !== undefined && model.thread?.thread.id === threadId ? model.thread : undefined;
  const listed = threadId === undefined ? undefined : here.threads.find((thread) => thread.id === threadId);
  const thread = live?.thread ?? listed;
  const names = namer(here.channel, model);
  // The agent whose screen the thread was opened from has its work shown beside it, from its session behind the thread.
  // A room's own threads have none: the marks chat keeps say who is working.
  const agent = agentOfThread(where);
  const dm = place.kind === "agent";
  // The person writes in their DM with an agent and in a room they are in, and in no other channel.
  const reading = place.kind === "read-only";
  const who = here.label;

  const messages = (live?.messages ?? []).map((message) => messageRow(message, model, names, now));
  const session = agent === undefined ? undefined : model.session;
  const markedWorking = thread?.working.map((mark) => names(mark.memberId)) ?? [];
  // A session that was working when the agent went away is not working now, whatever its last view says.
  const sessionBusy = session?.status.busy === true && model.agent?.state !== "down";
  const working =
    markedWorking.length > 0 || sessionBusy
      ? workingLine(markedWorking.length > 0 ? markedWorking : [agent ?? who], sessionBusy ? session.status.activity : undefined, !reading)
      : undefined;
  const can: Can = {
    back: true,
    send: !reading,
    newThread: !reading,
    filter: false,
    // There is something to turn over to once the agent has a session behind the thread.
    turnOver: agent !== undefined && threadId !== undefined && model.session !== undefined,
    work: agent !== undefined,
  };

  let lead: string | undefined;
  if (threadId === undefined) lead = reading ? undefined : dm ? newThreadHint(who) : newRoomThreadHint(here.name);
  else if (live !== undefined && live.earlier > 0) lead = earlierMessages(live.earlier, threadId);
  else if (live !== undefined && messages.length === 0) lead = THREAD_EMPTY;

  return {
    kind: "thread",
    title: threadTitle(who, thread === undefined ? threadId : titleOf(thread)),
    lead,
    messages,
    working,
    work: workOf(session, inFull),
    workStale: agent !== undefined && model.agent?.state === "down",
    commands: reading ? [] : commandLines(dm ? "dm" : "room"),
    readOnly: reading && here.channel !== undefined ? readOnlyLine(here.channel, model.me?.name) : undefined,
    status: model.status === undefined ? undefined : statusBlock(model.status),
    notes: notesOf(model, agent),
    keys: keyHints("thread", can, inFull),
    can,
  };
}

function statusBlock(status: Status): StatusBlock {
  const { about } = status;
  return { header: statusHeader(status.at), rows: about.kind === "agent" ? agentStatusRows(about) : roomStatusRows(about) };
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
function notesOf(model: Model, agent: string | undefined): string[] {
  const notes: string[] = [];
  const warn = (text: string | undefined): void => {
    if (text !== undefined) notes.push(text);
  };
  const { where } = model;
  const gatewayDown = model.gateway.state === "down";
  if (model.gateway.state === "down") warn(gatewayNote(model.gateway.why));
  // A session as the agent sees it, and a thread turned over to it, come from the agent, so the chat server has nothing to do with what they show.
  const watching = where.screen === "session" || (where.screen === "thread" && where.turned === true);
  // An agent's screen is made of what chat lists and what the agent says of its sessions.
  const listing = where.screen === "threads" && where.place.kind === "agent";
  // The gateway being gone is why nothing is registered: that is not worth saying twice.
  if (!watching && model.chat.state === "down" && !(gatewayDown && model.chat.why.kind === "not-registered")) warn(chatNote(model.chat.why));
  const looking = watching || listing ? "sessions" : where.screen === "thread" ? "work" : undefined;
  if (looking !== undefined && agent !== undefined && model.agent?.state === "down" && !(gatewayDown && model.agent.why.kind === "not-registered")) {
    warn(agentNote(oneLine(agent), model.agent.why, looking, model.homes?.(agent)));
  }
  if (model.refusal !== undefined && agent !== undefined && (listing || where.screen === "session")) {
    warn(refusalNote(listing ? "sessions" : "session", agent, model.refusal));
  }

  warn(model.listing === undefined ? undefined : versionWarning("the gateway", model.listing.version));
  const registered = model.listing?.programs ?? [];
  const chat = registered.findLast((program) => program.kind === "chat");
  warn(chat === undefined ? undefined : versionWarning("the chat server", chat.version));
  const running = agent === undefined ? undefined : registered.findLast((program) => program.kind === "agent" && program.name === agent);
  warn(running === undefined ? undefined : versionWarning(`the agent ${oneLine(agent ?? "")}`, running.version));

  if (model.notice !== undefined) warn(noticeText(model.notice, oneLine(agent ?? "")));
  return notes;
}
