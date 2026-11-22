import type { Model } from "../../state/index.ts";
import {
  type AgentsLevel,
  agentsLevel,
  BRIEF,
  type CommandLine,
  type InFull,
  type ListFilter,
  type ListLevel,
  listLevel,
  type MessageRow,
  sessionLevel,
  type SessionLevel,
  type StatusBlock,
  threadLevel,
  type ThreadLevel,
  type Work,
} from "../../view/index.ts";
import { type Can, emptyAgentList, keyHints, SELF } from "./words.ts";

/** Which level is in front, the one the console shows: the agents and rooms, the open list, or what is open in it. */
export type Front = "agents" | "list" | "item";

/** What every screen has besides its level. */
interface Chrome {
  /** The line of keys, one hint to an item: every key that does something here, with what it does. */
  keys: string[];
  /** What the keys that depend on the screen do here. `keys` is made from it. */
  can: Can;
}

export interface AgentsScreen extends AgentsLevel, Chrome {
  kind: "agents";
}

/** The open list: everything an agent takes part in, newest first, or the threads of a room or of a channel only read. */
export interface ThreadsScreen extends Pick<ListLevel, "title" | "stale" | "rows" | "empty" | "ofAgent" | "settled" | "notes">, Chrome {
  kind: "threads";
}

/**
 * The open thread, with the work and the wake-ups of the agent it was opened
 * from beside the conversation. Its title does not say when what was said may
 * be out of date: a long conversation has scrolled it away, and changing a line
 * that far up repaints the whole screen. The notes by the editor say so.
 */
export interface ThreadScreen extends Chrome {
  kind: "thread";
  title: string;
  lead: string | undefined;
  messages: MessageRow[];
  working: string | undefined;
  /** What the agent the thread was opened from is doing, step by step, while it works. */
  work: Work | undefined;
  /** A line for each wake-up that agent waits on in the thread, the soonest first. */
  waiting: string[];
  /** The work shown may be out of date: the agent is not being reached. */
  workStale: boolean;
  commands: CommandLine[];
  readOnly: string | undefined;
  status: StatusBlock | undefined;
  notes: string[];
}

/** The session on show, as its agent sees it. As for a thread, the title does not say when what is shown may be out of date. */
export interface SessionScreen extends Omit<SessionLevel, "agent" | "look" | "turned">, Chrome {
  kind: "session";
}

export type Screen = AgentsScreen | ThreadsScreen | ThreadScreen | SessionScreen;

export interface ScreenOptions {
  /** The moment it is, in milliseconds since the epoch, for saying when things happened. */
  now: number;
  /** What is shown in full where work is shown. Everything is brief when this is left out. */
  inFull?: InFull;
  /** What an agent's list shows. Everything when this is left out. */
  filter?: ListFilter;
}

/**
 * The level in front, as the console shows it, with what its keys do. A level
 * with nothing open shows the one before it.
 */
export function screenOf(model: Model, front: Front, options: ScreenOptions): Screen {
  const inFull = options.inFull ?? BRIEF;
  const at = { now: options.now, self: SELF };
  if (front === "item") {
    const session = sessionLevel(model, { ...at, inFull });
    if (session !== undefined) return sessionScreen(session, inFull);
    const thread = threadLevel(model, { ...at, inFull });
    if (thread !== undefined) return threadScreen(thread, inFull);
  }
  if (front !== "agents") {
    const list = listLevel(model, { ...at, ...(options.filter === undefined ? {} : { filter: options.filter }) });
    if (list !== undefined) return threadsScreen(list, inFull);
  }
  return agentsScreen(agentsLevel(model, at), inFull);
}

function agentsScreen(level: AgentsLevel, inFull: InFull): AgentsScreen {
  const can: Can = { back: false, send: false, newThread: false, filter: false, turnOver: false, work: false };
  return { kind: "agents", ...level, keys: keyHints("agents", can, inFull), can };
}

function threadsScreen(level: ListLevel, inFull: InFull): ThreadsScreen {
  const can: Can = { back: true, send: false, newThread: level.startable, filter: level.ofAgent, turnOver: false, work: false };
  return {
    kind: "threads",
    title: level.title,
    stale: level.stale,
    rows: level.rows,
    empty: level.empty !== undefined && level.ofAgent ? emptyAgentList(level.empty, level.name, level.more) : level.empty,
    ofAgent: level.ofAgent,
    settled: level.settled,
    notes: level.notes,
    keys: keyHints("threads", can, inFull),
    can,
  };
}

function threadScreen(level: ThreadLevel, inFull: InFull): ThreadScreen {
  const can: Can = {
    back: true,
    send: level.writable,
    newThread: level.writable,
    filter: false,
    turnOver: level.turnable,
    work: level.from !== undefined,
  };
  const work = level.works.find((each) => each.agent === level.from);
  return {
    kind: "thread",
    title: level.title,
    lead: level.lead,
    messages: level.messages,
    working: level.working,
    work: work?.work,
    waiting: level.waiting.filter((each) => each.agent === level.from).map((each) => each.line),
    workStale: work?.stale ?? false,
    commands: level.commands,
    readOnly: level.readOnly,
    status: level.status,
    notes: level.notes,
    keys: keyHints("thread", can, inFull),
    can,
  };
}

function sessionScreen(level: SessionLevel, inFull: InFull): SessionScreen {
  const can: Can = { back: true, send: false, newThread: false, filter: false, turnOver: level.turned, work: true };
  return {
    kind: "session",
    title: level.title,
    lead: level.lead,
    steps: level.steps,
    working: level.working,
    idle: level.idle,
    queued: level.queued,
    waiting: level.waiting,
    stale: level.stale,
    notes: level.notes,
    keys: keyHints("session", can, inFull),
    can,
  };
}
