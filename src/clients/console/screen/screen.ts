import type { Channel, Message, Thread } from "../../../contracts/chat/index.ts";
import { agentEntries, type Model, type Place, roomEntries, workingIn } from "../state/index.ts";
import { type CommandLine, commandLines } from "./commands.ts";
import { oneLine, plain } from "./plain.ts";
import { whenOf } from "./time.ts";
import { type Step, type Work, watchOf, workOf } from "./work.ts";
import {
  agentNote,
  agentsTitle,
  AGENTS_EMPTY,
  type Can,
  chatNote,
  DELETED,
  editedAt,
  earlierItems,
  earlierMessages,
  gatewayNote,
  idleLine,
  type InFull,
  keyHints,
  newRoomThreadHint,
  newThreadHint,
  NO_TITLE,
  noticeText,
  placeWords,
  queuedLine,
  reactionsLine,
  receiptNote,
  refusalNote,
  roomLabel,
  roomThreadsTitle,
  SESSION_EMPTY,
  sessionsEmpty,
  sessionsTitle,
  sessionTitle,
  THREAD_EMPTY,
  threadsEmpty,
  threadsTitle,
  threadTitle,
  versionWarning,
  workingLine,
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
  /** What the state is told when the row is chosen: an agent's name, a room's channel ID, a thread's ID or a session's address. It is never shown. */
  id: string;
  /** What choosing it opens. */
  kind: "agent" | "room" | "thread" | "session";
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

/** The sessions of an agent, which is the other list on its screen beside the person's threads with it. */
export interface SessionsScreen extends Chrome {
  kind: "sessions";
  title: string;
  /** The list may be out of date: the agent is not being reached. */
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
  /** Every command the person can write here, in order of name, each with what it does here. The editor lists them while the text starts with a slash. */
  commands: CommandLine[];
}

/** One of an agent's sessions, as the agent sees it. It is for watching: nothing is said or done in it. */
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

export type Screen = AgentsScreen | ThreadsScreen | SessionsScreen | ThreadScreen | SessionScreen;

export interface ScreenOptions {
  /** The moment it is, in milliseconds since the epoch, for saying when things happened. */
  now: number;
  /** What is shown in full where work is shown. Everything is brief when this is left out. */
  inFull?: InFull;
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
      return threadsScreen(model, where.place, options.now, inFull);
    case "thread":
      return threadScreen(model, where.place, where.thread, options.now, inFull);
    case "sessions":
      return sessionsScreen(model, where.agent, inFull);
    case "session":
      return sessionScreen(model, where.agent, where.session, inFull);
  }
}

function agentsScreen(model: Model, inFull: InFull): AgentsScreen {
  const can: Can = { back: false, newThread: false, switchLists: false, work: false };
  const agents: Row[] = agentEntries(model).map((entry) => ({
    id: entry.name,
    kind: "agent",
    label: oneLine(entry.name),
    detail: entry.running ? (entry.working ? "working" : "idle") : "not running",
    working: entry.working,
  }));
  const rooms: Row[] = roomEntries(model).map((entry) => ({
    id: entry.id,
    kind: "room",
    label: roomLabel(entry.name),
    detail: [entry.members.map(oneLine).join(", "), entry.working ? "working" : undefined].filter((part) => part !== undefined && part !== "").join(" · "),
    working: entry.working,
  }));
  const rows = [...agents, ...rooms];
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

/** The threads the person looks at: an agent's DM with them, or a room. */
interface Looking {
  /** The agent's name, or the room's. */
  name: string;
  channel: Channel | undefined;
  threads: Thread[];
  /** Whether the one it is about is at work in the thread: the agent in its DM, or anyone in a room. */
  busyIn(thread: Thread): boolean;
}

function lookingAt(model: Model, place: Place): Looking {
  if (place.kind === "room") {
    const room = model.rooms[place.id];
    return {
      name: room?.channel.name ?? place.id,
      channel: room?.channel,
      threads: room?.threads ?? [],
      busyIn: (thread) => thread.working.length > 0,
    };
  }
  const dm = model.dms[place.name];
  // Chat's working marks name members by ID, and the agent is the one agent in its DM with the person.
  const agentId = dm?.channel.members.find((member) => member.kind === "agent")?.id;
  return {
    name: place.name,
    channel: dm?.channel,
    threads: dm?.threads ?? [],
    busyIn: (thread) => agentId !== undefined && workingIn(thread, agentId),
  };
}

function threadsScreen(model: Model, place: Place, now: number, inFull: InFull): ThreadsScreen {
  const here = lookingAt(model, place);
  // An agent has sessions to switch to, and a room does not.
  const can: Can = { back: true, newThread: true, switchLists: place.kind === "agent", work: false };
  const rows: Row[] = here.threads.map((thread) => ({
    id: thread.id,
    kind: "thread",
    label: titleWithTags(thread),
    detail: [whenOf(thread.updatedAt, now), here.busyIn(thread) ? "working" : undefined].filter((part) => part !== undefined).join(" · "),
    working: here.busyIn(thread),
  }));
  const agent = place.kind === "agent" ? place.name : undefined;
  return {
    kind: "threads",
    title: place.kind === "agent" ? threadsTitle(oneLine(here.name)) : roomThreadsTitle(here.name),
    stale: model.chat.state === "down",
    rows,
    // A room always has its main thread, so there is no one to ask the person to start a talk with.
    empty: rows.length === 0 && model.chat.state === "up" && agent !== undefined ? threadsEmpty(oneLine(agent)) : undefined,
    notes: notesOf(model, agent),
    keys: keyHints("threads", can, inFull),
    can,
  };
}

function sessionsScreen(model: Model, agent: string, inFull: InFull): SessionsScreen {
  const can: Can = { back: true, newThread: false, switchLists: true, work: false };
  const rows: Row[] = (model.sessions ?? []).map((session) => ({
    id: session.id,
    kind: "session",
    label: placeWords(session.place, session.id, model.me?.name),
    detail: session.working ? "working" : "idle",
    working: session.working,
  }));
  const stale = model.agent?.state === "down";
  return {
    kind: "sessions",
    title: sessionsTitle(agent),
    stale,
    rows,
    // Until the agent has said which sessions it has, there is nothing to claim about them.
    empty: model.sessions !== undefined && rows.length === 0 && !stale ? sessionsEmpty(agent) : undefined,
    notes: notesOf(model, agent),
    keys: keyHints("sessions", can, inFull),
    can,
  };
}

function sessionScreen(model: Model, agent: string, address: string, inFull: InFull): SessionScreen {
  const can: Can = { back: true, newThread: false, switchLists: false, work: true };
  const view = model.session;
  const summary = model.sessions?.find((each) => each.id === address);
  // A session that was working when the agent went away is not working now, whatever its last view says.
  const stale = model.agent?.state === "down";
  const busy = view?.status.busy === true && !stale;
  const watched = view === undefined ? undefined : watchOf(view, inFull);

  let lead: string | undefined;
  if (watched !== undefined && watched.earlier > 0) lead = earlierItems(watched.earlier, address, agent);
  else if (view !== undefined && view.items.length === 0) lead = SESSION_EMPTY;

  return {
    kind: "session",
    title: sessionTitle(agent, placeWords(summary?.place ?? null, address, model.me?.name)),
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

function threadScreen(model: Model, place: Place, threadId: string | undefined, now: number, inFull: InFull): ThreadScreen {
  const here = lookingAt(model, place);
  const live = threadId !== undefined && model.thread?.thread.id === threadId ? model.thread : undefined;
  const listed = threadId === undefined ? undefined : here.threads.find((thread) => thread.id === threadId);
  const thread = live?.thread ?? listed;
  const names = namer(here.channel, model);
  // Only an agent's DM has a session to show. In a room the marks chat keeps say who is working.
  const isAgent = place.kind === "agent";
  const who = isAgent ? oneLine(here.name) : roomLabel(here.name);

  const messages = (live?.messages ?? []).map((message) => messageRow(message, model, names, now));
  const session = isAgent ? model.session : undefined;
  const markedWorking = thread?.working.map((mark) => names(mark.memberId)) ?? [];
  // A session that was working when the agent went away is not working now, whatever its last view says.
  const sessionBusy = session?.status.busy === true && model.agent?.state !== "down";
  const working =
    markedWorking.length > 0 || sessionBusy
      ? workingLine(markedWorking.length > 0 ? markedWorking : [who], sessionBusy ? session.status.activity : undefined, true)
      : undefined;
  const can: Can = { back: true, newThread: true, switchLists: false, work: isAgent };

  let lead: string | undefined;
  if (threadId === undefined) lead = isAgent ? newThreadHint(who) : newRoomThreadHint(here.name);
  else if (live !== undefined && live.earlier > 0) lead = earlierMessages(live.earlier, threadId);
  else if (live !== undefined && messages.length === 0) lead = THREAD_EMPTY;

  return {
    kind: "thread",
    title: threadTitle(who, thread === undefined ? threadId : titleOf(thread)),
    lead,
    messages,
    working,
    work: workOf(session, inFull),
    workStale: isAgent && model.agent?.state === "down",
    commands: commandLines(isAgent ? "dm" : "room"),
    notes: notesOf(model, isAgent ? here.name : undefined),
    keys: keyHints("thread", can, inFull),
    can,
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
function notesOf(model: Model, agent: string | undefined): string[] {
  const notes: string[] = [];
  const warn = (text: string | undefined): void => {
    if (text !== undefined) notes.push(text);
  };
  const { where } = model;
  const gatewayDown = model.gateway.state === "down";
  if (model.gateway.state === "down") warn(gatewayNote(model.gateway.why));
  // An agent's sessions come from the agent, so the chat server has nothing to do with what they show.
  const watching = where.screen === "sessions" || where.screen === "session";
  // The gateway being gone is why nothing is registered: that is not worth saying twice.
  if (!watching && model.chat.state === "down" && !(gatewayDown && model.chat.why.kind === "not-registered")) warn(chatNote(model.chat.why));
  const looking = where.screen === "thread" ? "work" : watching ? "sessions" : undefined;
  if (looking !== undefined && agent !== undefined && model.agent?.state === "down" && !(gatewayDown && model.agent.why.kind === "not-registered")) {
    warn(agentNote(oneLine(agent), model.agent.why, looking, model.homes?.(agent)));
  }
  if (model.refusal !== undefined && agent !== undefined && (where.screen === "sessions" || where.screen === "session")) {
    warn(refusalNote(where.screen, agent, model.refusal));
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
