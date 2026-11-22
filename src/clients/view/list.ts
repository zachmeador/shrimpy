import { placeLabel, threadLabel, YOUR_DM } from "../../contracts/agent/index.ts";
import { notTalkedTo, taggedTitle } from "../../contracts/chat/index.ts";
import { oneLine } from "../../lib/plain/index.ts";
import { agentEntries, agentNameOf, type Model, type Part, partsOf, type Place } from "../state/index.ts";
import { type LevelOptions, lookingAt, type Row } from "./level.ts";
import { type Look, lookOf } from "./look.ts";
import { notesOf } from "./notes.ts";
import { whenOf } from "./time.ts";
import { ADMIN_TAG, type ListFilter, notRunning, PICK_LIST, PICK_THREAD, pickOrStart, READ_ONLY_TAG, thenStart } from "./words.ts";

/**
 * The second level: everything the agent whose list is open takes part in,
 * newest first, or the threads of the open room or channel.
 */
export interface ListLevel {
  /** The list may be out of date: chat is not being reached, or the agent is not, and what it last said is shown. */
  stale: boolean;
  rows: Row[];
  /** What to say instead of an empty list, if there is something to say. */
  empty: string | undefined;
  /** Whose list it is, on one line: the agent's name, or the room's or the channel's label. */
  name: string;
  /** The word that stands beside the name: that the agent is an admin, or that the room is only read. */
  tag: string | undefined;
  /** How the agent whose list it is looks. */
  look: Look | undefined;
  /** It is an agent's list, and not a room's or a channel's. */
  ofAgent: boolean;
  /** Everything that will be listed is in: on an agent's list, the agent has said which sessions it has. */
  settled: boolean;
  /** The filter leaves rows out: an agent's list of only what is with the person has more. */
  more: boolean;
  /** A thread can be started from it: it is an agent's, or a room's the person is in. */
  startable: boolean;
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
  const rows: Row[] = here.threads.map((thread) => ({
    id: thread.id,
    kind: "thread",
    label: taggedTitle(thread),
    name: taggedTitle(thread),
    detail: [whenOf(thread.updatedAt, options.now), thread.working.length > 0 ? "working" : undefined].filter((part) => part !== undefined).join(" · "),
    working: thread.working.length > 0,
    unread: here.unread[thread.id] ?? 0,
    yours: false,
    look: undefined,
  }));
  return {
    stale: model.chat.state === "down",
    rows,
    // A room always has its main thread, so there is no one to ask the person to start a talk with.
    empty: undefined,
    name: here.label,
    tag: place.kind === "read-only" ? READ_ONLY_TAG : undefined,
    look: undefined,
    ofAgent: false,
    settled: true,
    more: false,
    // A channel the person only reads takes no new thread.
    startable: place.kind !== "read-only",
    notes: notesOf(model, { agent: undefined, watching: false, looking: undefined, refused: undefined, notice: false }, options.self),
  };
}

/**
 * An agent's list: everything the agent takes part in, or only what is with the
 * person. What the agent says of its sessions is a part of the list, so it is
 * as stale as the agent is out of reach.
 */
function agentList(model: Model, agentId: string, filter: ListFilter, options: LevelOptions): ListLevel {
  const name = agentNameOf(model, agentId);
  const parts = partsOf(model, agentId);
  const rows = parts.filter((part) => filter === "everything" || part.yours).map((part) => partRow(part, model.me?.name, options.now));
  const listed = model.sessions !== undefined;
  const refused = model.refusal === undefined ? undefined : { what: "sessions" as const, words: model.refusal };
  return {
    stale: model.chat.state === "down" || (model.agent?.state === "down" && listed),
    rows,
    empty: rows.length === 0 && model.chat.state === "up" ? notTalkedTo(name) : undefined,
    name: oneLine(name),
    // Who is an admin is the roster's to say.
    tag: model.listing?.members.some((member) => member.id === agentId && member.admin) === true ? ADMIN_TAG : undefined,
    look: lookOf(model, agentId),
    ofAgent: true,
    settled: listed,
    more: rows.length < parts.length,
    startable: true,
    notes: notesOf(model, { agent: agentId, watching: false, looking: "sessions", refused, notice: false }, options.self),
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
    const label = where ?? oneLine(part.id);
    return { id: part.id, kind: "session", label, name: label, detail: working ?? "", working: part.working, unread: 0, yours: part.yours, look: undefined };
  }
  // Chat names a thread. A thread only the agent has said it has is called what the agent knows of it.
  let label = oneLine(part.id);
  if (part.thread !== undefined) label = taggedTitle(part.thread);
  else if (part.place !== null && part.place.kind !== "trigger") label = threadLabel(part.place.thread, part.id);
  const when = part.at === undefined ? undefined : whenOf(part.at, now);
  return {
    id: part.id,
    kind: "thread",
    label,
    name: label,
    detail: [where, when, working].filter((each) => each !== undefined).join(" · "),
    working: part.working,
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
  if (!agentEntries(model).some((entry) => entry.id === list.id && entry.running)) return { said: notRunning(name), start: "none" };
  return partsOf(model, list.id).some((part) => part.yours)
    ? { said: pickOrStart(key), start: "beside" }
    : { said: thenStart(notTalkedTo(name), key), start: "instead" };
}
