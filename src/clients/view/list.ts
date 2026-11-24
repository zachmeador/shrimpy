import { placeLabel, threadName, YOUR_DM } from "../../contracts/agent/index.ts";
import { ARCHIVED, notTalkedTo, threadTags, titleOf } from "../../contracts/chat/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { agentEntries, agentNameOf, agentRuns, type Model, type Part, partsOf, type Place, unreadOf } from "../state/index.ts";
import { agentAbout } from "./agents.ts";
import { type LevelOptions, lookingAt, type Row } from "./level.ts";
import { type Look, lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { whenOf } from "./time.ts";
import {
  ADMIN_TAG,
  agentFacts,
  archivedRow,
  type ListFilter,
  membersLine,
  noTriggers,
  notRunning,
  PICK_LIST,
  PICK_THREAD,
  pickOrStart,
  READ_ONLY_TAG,
  thenStart,
} from "./words.ts";

/**
 * The second level: everything the agent whose list is open takes part in,
 * newest first, or the threads of the open room or channel.
 */
export interface ListLevel {
  /** The list may be out of date: chat is not being reached, or the agent is not, and what it last said is shown. */
  stale: boolean;
  /** What it lists, but for its archived threads. */
  rows: Row[];
  /**
   * The archived threads, which stand apart at the foot of the list, shut
   * until the person opens them: the row that opens them, which says how many
   * there are and has someone working while an agent works in one, and theirs.
   * Undefined while there are none.
   */
  archived: { row: Row; rows: Row[] } | undefined;
  /** What to say where the person's threads with the agent would be, while they have none. */
  empty: string | undefined;
  /** Whose list it is, on one line: the agent's name, or the room's or the channel's label. */
  label: string;
  /** What the label names, on its own: a room's name without the mark its label starts with, and an agent's name. */
  name: string;
  /** The word that stands beside the name: that the agent is an admin, or that the room is only read. */
  tag: string | undefined;
  /**
   * The line under the name: for an agent, how it stands, as the agents and
   * rooms say it; for a room, every member by name, the person among them.
   */
  about: string;
  /** The agent whose list it is works somewhere, and what is shown is not out of date. */
  working: boolean;
  /** The line under that, of an agent that is running: the model it follows by default and the version of Shrimpy it runs. */
  facts: string | undefined;
  /** How the agent whose list it is looks. */
  look: Look | undefined;
  /** It is an agent's list, and not a room's or a channel's. */
  ofAgent: boolean;
  /** It is the list of an agent that is not running, which takes no thread and has no home to read. */
  off: boolean;
  /** Everything that will be listed is in: on an agent's list, the agent has said which sessions it has. */
  settled: boolean;
  /** The filter leaves rows out: an agent's list of only what is with the person has more. */
  more: boolean;
  /** A thread can be started from it: it is a running agent's, or a room's the person is in. */
  startable: boolean;
  /** What an agent's triggers show while it has none. */
  noTriggers: string;
  /** What is not working, or has just gone wrong, most pressing first. */
  notes: string[];
}

export interface ListOptions extends LevelOptions {
  /** What an agent's list shows. Everything when this is left out. */
  filter?: ListFilter;
}

/** The open list, as plain text and facts, or none while no list is open. */
export function listLevel(model: Model, options: ListOptions): ListLevel | undefined {
  const { list } = model.open;
  if (list === undefined) return undefined;
  return list.kind === "agent" ? agentList(model, list.id, options.filter ?? "everything", options) : channelList(model, list, options);
}

/** The threads of a room the person is in, or of a room they only read. */
function channelList(model: Model, place: Exclude<Place, { kind: "agent" }>, options: LevelOptions): ListLevel {
  const here = lookingAt(model, place);
  const stale = model.chat.state === "down";
  const reading = place.kind === "read-only";
  const listed = here.threads.map((thread) => ({
    archived: thread.archived,
    row: {
      id: thread.id,
      kind: "thread",
      label: titleOf(thread),
      name: titleOf(thread),
      tags: threadTags({ main: thread.main, archived: false }),
      detail: [whenOf(thread.updatedAt, options.now), reading ? READ_ONLY_TAG : undefined].filter((part) => part !== undefined).join(" · "),
      working: thread.working.length > 0 && !stale,
      unread: unreadOf(here.unread, thread),
      yours: false,
      look: undefined,
    } satisfies Row,
  }));
  const members = here.channel?.members ?? [];
  return {
    stale,
    ...apart(listed),
    // A room always has its main thread, so there is no one to ask the person to start a talk with.
    empty: undefined,
    label: here.label,
    name: oneLine(here.name),
    tag: reading ? READ_ONLY_TAG : undefined,
    about: membersLine(members),
    working: false,
    facts: undefined,
    look: undefined,
    ofAgent: false,
    off: false,
    settled: true,
    more: false,
    // A channel the person only reads takes no new thread.
    startable: !reading,
    noTriggers: "",
    notes: notesOf(model, { agent: undefined, watching: false, looking: undefined, refused: undefined, notice: false }, options.self),
  };
}

/**
 * An agent's list: everything the agent takes part in, or only what is with the
 * person. What the agent says of its sessions is a part of the list, so it is
 * as stale as the agent is out of reach, and no one is said to work in what is
 * stale.
 */
function agentList(model: Model, agentId: string, filter: ListFilter, options: LevelOptions): ListLevel {
  const name = agentNameOf(model, agentId);
  const parts = partsOf(model, agentId);
  const said = model.sessions !== undefined;
  const stale = model.chat.state === "down" || (model.agent?.state === "down" && said);
  const shown = parts.filter((part) => filter === "everything" || part.yours);
  const listed = shown.map((part) => ({ archived: part.thread?.archived === true, row: partRow(part, model.me?.name, options.now, stale, readOnly(model, part)) }));
  const refused = model.refusal === undefined ? undefined : { what: "sessions" as const, words: model.refusal };
  const entry = agentEntries(model).find((each) => each.id === agentId);
  const running = entry?.running === true;
  // Who is an admin is the roster's to say.
  const members = model.listing?.members ?? [];
  const admins = members.filter((member) => member.kind === "agent" && member.admin && member.id !== agentId).map((member) => member.name);
  return {
    stale,
    ...apart(listed),
    empty: !parts.some((part) => part.yours) && model.chat.state === "up" ? notTalkedTo(name) : undefined,
    label: oneLine(name),
    name: oneLine(name),
    tag: members.some((member) => member.id === agentId && member.admin) ? ADMIN_TAG : undefined,
    about: entry === undefined ? "" : agentAbout(entry, model.me?.name),
    working: entry?.working === true && !stale,
    facts: running ? agentFacts(model.defaultModel, entry.version) : undefined,
    look: lookOf(model, agentId),
    ofAgent: true,
    off: !running,
    settled: said,
    more: shown.length < parts.length,
    startable: running,
    noTriggers: noTriggers(name, admins.sort((a, b) => a.localeCompare(b))),
    notes: notesOf(model, { agent: agentId, watching: false, looking: "sessions", refused, notice: false }, options.self),
  };
}

/** The rows of a list, the archived threads apart from the rest, under the row that opens them. */
function apart(listed: readonly { archived: boolean; row: Row }[]): Pick<ListLevel, "rows" | "archived"> {
  const rows = listed.filter((each) => !each.archived).map((each) => each.row);
  const away = listed.filter((each) => each.archived).map((each) => each.row);
  if (away.length === 0) return { rows, archived: undefined };
  const label = archivedRow(away.length);
  const row: Row = { id: ARCHIVED, kind: "archived", label, name: label, tags: [], detail: "", working: away.some((each) => each.working), unread: 0, yours: false, look: undefined };
  return { rows, archived: { row, rows: away } };
}

/**
 * Whether the person only reads what an agent takes part in: a thread of a
 * channel they are not in, as chat lists it, or a DM with another agent, as
 * the agent said. A trigger's own session has no one in it to be left out.
 */
function readOnly(model: Model, part: Part): boolean {
  if (part.thread !== undefined) return model.readOnly[part.thread.channelId] !== undefined;
  return part.place?.kind === "dm" && part.place.with.kind === "agent";
}

/**
 * The row for something an agent takes part in: what it is called, with the
 * words that mark it, then where it is, when it was last active, and that the
 * person only reads it when they are not in it. A session behind no thread is
 * called for where it is, and has no time.
 */
function partRow(part: Part, me: string | undefined, now: number, stale: boolean, reading: boolean): Row {
  const where = part.yours ? YOUR_DM : part.place === null ? undefined : placeLabel(part.place, me);
  const working = part.working && !stale;
  if (part.kind === "session") {
    const label = where ?? oneLine(part.id);
    return { id: part.id, kind: "session", label, name: label, tags: [], detail: "", working, unread: 0, yours: part.yours, look: undefined };
  }
  // Chat names a thread. A thread only the agent has said it has is called what the agent knows of it.
  let label = oneLine(part.id);
  let tags: string[] = [];
  // An archived thread stands apart under the row that says so, which marks it.
  if (part.thread !== undefined) {
    label = titleOf(part.thread);
    tags = threadTags({ main: part.thread.main, archived: false });
  } else if (part.place !== null && part.place.kind !== "trigger") {
    const named = threadName(part.place.thread, part.id);
    label = named.label;
    tags = named.named ? threadTags({ main: part.place.thread.main, archived: false }) : [];
  }
  const when = part.at === undefined ? undefined : whenOf(part.at, now);
  return {
    id: part.id,
    kind: "thread",
    label,
    name: label,
    tags,
    detail: [where, when, reading ? READ_ONLY_TAG : undefined].filter((each) => each !== undefined).join(" · "),
    working,
    unread: part.unread,
    yours: part.yours,
    look: undefined,
  };
}

/**
 * What stands where a thread would be while none is open, and whether a thread
 * can be started there: beside threads to pick, in place of any, or not at
 * all.
 */
export interface NothingOpen {
  said: string;
  start: "beside" | "instead" | "none";
}

/**
 * What stands where a thread would be while no list is open, or nothing is
 * open in the open one: what to pick, that the list's agent is not running, or
 * that the person has not talked to it yet, with how to start a thread where
 * one can be. `key` is the client's key that starts one, as the client writes
 * it. Undefined while something is open.
 */
export function nothingOpen(model: Model, key: string): NothingOpen | undefined {
  const { list, item } = model.open;
  if (item !== undefined) return undefined;
  if (list === undefined) return { said: PICK_LIST, start: "none" };
  // A room the person is in takes a new thread, and a channel they only read takes none.
  if (list.kind === "read-only") return { said: PICK_THREAD, start: "none" };
  if (list.kind === "room") return { said: pickOrStart(key), start: "beside" };
  const name = agentNameOf(model, list.id);
  if (!agentRuns(model, list.id)) return { said: notRunning(name), start: "none" };
  return partsOf(model, list.id).some((part) => part.yours)
    ? { said: pickOrStart(key), start: "beside" }
    : { said: thenStart(notTalkedTo(name), key), start: "instead" };
}
