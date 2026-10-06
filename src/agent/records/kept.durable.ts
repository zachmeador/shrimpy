import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  type Breadcrumb,
  type Breadcrumbs,
  isChat,
  isWakeup,
  type Outstanding,
  type Place,
  type Snapshot,
  type Wakeup,
} from "../inputs/index.ts";
import { plain, type SessionRecord } from "./documents.durable.ts";

/*
 * What a session keeps in its record for its next input, because the model has
 * not been shown it: chat events nobody acted on, and wake-ups that were
 * cancelled. It is taken out of the record in the commit that admits the input
 * it goes with, so it is told once, and put back if that input is skipped. The
 * breadcrumbs are kept the other way round: the record says which were shown,
 * and the files that differ from that go with the next input. A thread's session
 * also keeps where the thread is, which every input of the session carries.
 */

/** How many breadcrumbs an input carries at the most: when more differ, the rest wait for later inputs. */
const MOST_BREADCRUMBS = 10;

/** Enough of a breadcrumb's text to tell whether it has changed. */
const digestOf = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** The chat events kept for the session's next chat event, oldest first. The session keeps none afterwards. */
export function takeEvents(session: SessionRecord): Snapshot[] {
  const events = plain(session.unacted);
  session.unacted = [];
  return events;
}

/** The wake-ups kept as cancelled. The session keeps none afterwards. */
export function takeCancelled(session: SessionRecord): Wakeup[] {
  const cancelled = plain(session.cancelled ?? []);
  if (cancelled.length > 0) session.cancelled = [];
  return cancelled;
}

/**
 * The breadcrumbs the session is shown with its next input: the files, in the
 * order they come in, whose text differs from what it was last shown, as many as
 * an input carries, and how many more there are. The session's record keeps what
 * it is shown, and forgets the files that are gone, saying nothing of them. A file
 * that differs and does not fit keeps what the session was last shown of it, so it
 * comes with a later input. Nothing when no file differs.
 */
export function takeBreadcrumbs(session: SessionRecord, files: readonly Breadcrumb[]): Breadcrumbs | undefined {
  const shown = session.shown ?? {};
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

/**
 * What an input carries of the cancelled wake-ups and the breadcrumbs it was
 * handed: nothing of either when there is none, so that an input with none is
 * stored as it was before they existed.
 */
export function carrying(cancelled: Wakeup[], breadcrumbs?: Breadcrumbs): { cancelled?: Wakeup[]; breadcrumbs?: Breadcrumbs } {
  return {
    ...(cancelled.length === 0 ? {} : { cancelled }),
    ...(breadcrumbs === undefined ? {} : { breadcrumbs }),
  };
}

/** Where the session's thread is, as a copy, or nothing for a session that has not learned it or is behind no thread. */
export function keptPlace(session: SessionRecord): Place | undefined {
  return session.channelId === null || session.place === undefined ? undefined : plain(session.place);
}

/**
 * Keep where a session's thread is, as chat says it now. The record is written
 * only when that differs from what it has, as after a rename or when a member
 * joins a room. A trigger's own session is behind no thread and has none.
 */
export function learnPlace(session: SessionRecord, place: Place): void {
  if (session.channelId === null) return;
  if (session.place !== undefined && isDeepStrictEqual(plain(session.place), place)) return;
  session.place = plain(place);
}

/** Keep wake-ups as cancelled, each once, in the order they were for. */
export function keepCancelled(session: SessionRecord, wakeups: readonly Wakeup[]): void {
  const byId = new Map([...plain(session.cancelled ?? []), ...wakeups].map((wakeup) => [wakeup.id, wakeup]));
  session.cancelled = [...byId.values()].sort((a, b) => a.due - b.due);
}

/**
 * Keep what an input that was skipped was to show the model, for the session's
 * next input: the model never saw it. A chat event is kept with the events that
 * came with it, and a wake-up is kept as one that was cancelled, because a stop
 * is what withdrew it. An occurrence of a trigger is not kept: the trigger's
 * next one says the same. What the input carried of the cancelled wake-ups is
 * kept again too, and so are the messages of a room that came with a chat event,
 * since the agent has moved past them. The breadcrumbs it carried were never
 * shown, so the session forgets that it was shown them, unless a later input has
 * shown it a later version of the file since.
 */
export function keepSkipped(session: SessionRecord, input: Outstanding): void {
  if (isWakeup(input)) keepCancelled(session, [input.wakeup]);
  else if (isChat(input)) {
    session.unacted = inOrder([...plain(session.unacted), ...input.earlier, ...(input.backlog?.messages ?? []), input.event]);
  }
  keepCancelled(session, input.cancelled ?? []);
  if (input.breadcrumbs !== undefined && session.shown !== undefined) {
    const shown = plain(session.shown);
    const carried = new Map(input.breadcrumbs.files.map(({ name, text }) => [name, digestOf(text)]));
    session.shown = Object.fromEntries(Object.entries(shown).filter(([name, digest]) => carried.get(name) !== digest));
  }
}

/** Events by position in chat's order, each once. */
function inOrder(events: Snapshot[]): Snapshot[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}
