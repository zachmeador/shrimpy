import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  type Breadcrumb,
  type Breadcrumbs,
  isChat,
  isWatch,
  type Outstanding,
  type Place,
  type Snapshot,
  type WatchSettled,
} from "../inputs/index.ts";
import { copyOf, type SessionRecord } from "./documents.durable.ts";

/** How many breadcrumbs an input carries at the most: when more differ, the rest wait for later inputs. */
const MOST_BREADCRUMBS = 10;

/** Enough of a breadcrumb's text to tell whether it has changed. */
const digestOf = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** The chat events kept for the session's next chat event, oldest first. The session keeps none afterwards. */
export function takeEvents(session: SessionRecord): Snapshot[] {
  const events = copyOf(session.unacted);
  session.unacted = [];
  return events;
}

/** The settled watch results kept as missed, oldest first. The session keeps none afterwards. */
export function takeMissed(session: SessionRecord): WatchSettled[] {
  const missed = copyOf(session.missed);
  if (missed.length > 0) session.missed = [];
  return missed;
}

/**
 * The breadcrumbs the session is shown with its next input: the files, in the
 * order they come in, whose text differs from what it was last shown, as many as
 * an input carries, and how many more there are.
 */
export function takeBreadcrumbs(session: SessionRecord, files: readonly Breadcrumb[]): Breadcrumbs | undefined {
  const shown = session.shown;
  const differ = files.filter(({ name, text }) => shown[name] !== digestOf(text));
  const carried = differ.slice(0, MOST_BREADCRUMBS);
  const now: Record<string, string> = {};
  for (const { name, text } of files) {
    const digest = carried.some((each) => each.name === name) ? digestOf(text) : shown[name];
    if (digest !== undefined) now[name] = digest;
  }
  const kept = Object.keys(now).length === Object.keys(shown).length && Object.entries(now).every(([name, digest]) => shown[name] === digest);
  if (!kept) session.shown = now;
  if (carried.length === 0) return undefined;
  const more = differ.length - carried.length;
  return { files: carried.map(({ name, text }) => ({ name, text })), ...(more > 0 ? { more } : {}) };
}

/** What an input carries of the missed watch results and the breadcrumbs it was handed. */
export function carrying(
  missed: WatchSettled[],
  breadcrumbs?: Breadcrumbs,
): { missed: WatchSettled[]; breadcrumbs?: Breadcrumbs } {
  return { missed, ...(breadcrumbs === undefined ? {} : { breadcrumbs }) };
}

/** Where the session's thread is, as a copy, or nothing if not yet learned. */
export function keptPlace(session: SessionRecord): Place | undefined {
  return session.place === undefined ? undefined : copyOf(session.place);
}

/** Keep where a session's thread is, as chat says it now. */
export function learnPlace(session: SessionRecord, place: Place): void {
  if (session.place !== undefined && isDeepStrictEqual(copyOf(session.place), place)) return;
  session.place = copyOf(place);
}

/** Keep settled watch results as missed, each once, oldest first. */
function keepMissed(session: SessionRecord, results: readonly WatchSettled[]): void {
  if (results.length === 0) return;
  const byId = new Map([...copyOf(session.missed), ...results].map((each) => [each.watch.id, each]));
  session.missed = [...byId.values()].sort((a, b) => a.watch.startedAt - b.watch.startedAt);
}

/**
 * Keep what an input that was skipped was to show the model, for the session's
 * next input. A chat event is kept with the events that came with it, and a
 * settled watch result is kept as missed.
 */
export function keepSkipped(session: SessionRecord, input: Outstanding): void {
  if (isWatch(input)) keepMissed(session, [input.settled]);
  else if (isChat(input)) {
    const said = (input.backlog?.messages ?? []).filter((message) => message.kind === "posted");
    session.unacted = inOrder([...copyOf(session.unacted), ...input.earlier, ...said, input.event]);
  }
  keepMissed(session, input.missed);
  if (input.breadcrumbs !== undefined) {
    const shown = copyOf(session.shown);
    const carried = new Map(input.breadcrumbs.files.map(({ name, text }) => [name, digestOf(text)]));
    session.shown = Object.fromEntries(Object.entries(shown).filter(([name, digest]) => carried.get(name) !== digest));
  }
}

/** Events by position in chat's order, each once. */
function inOrder(events: Snapshot[]): Snapshot[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}
