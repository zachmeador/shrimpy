import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import {
  type Breadcrumb,
  type Breadcrumbs,
  isChat,
  isOccurrence,
  isProcess,
  isWatch,
  MAX_BREADCRUMBS_PER_INPUT,
  type Missed,
  type Outstanding,
  type Place,
  type Snapshot,
} from "../inputs/index.ts";
import { copyOf, type SessionRecord } from "./documents.durable.ts";

/** Enough of a breadcrumb's text to tell whether it has changed. */
const digestOf = (text: string): string => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** The chat events kept for the session's next chat event, oldest first. The session keeps none afterwards. */
export function takeEvents(session: SessionRecord): Snapshot[] {
  const events = copyOf(session.unacted);
  session.unacted = [];
  return events;
}

/** What the session kept as missed, oldest first. The session keeps none afterwards. */
export function takeMissed(session: SessionRecord): Missed[] {
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
  const carried = differ.slice(0, MAX_BREADCRUMBS_PER_INPUT);
  const now: Record<string, string> = {};
  for (const { name, text } of files) {
    const digest = carried.some((each) => each.name === name) ? digestOf(text) : shown[name];
    if (digest !== undefined) now[name] = digest;
  }
  const kept = Object.keys(now).length === Object.keys(shown).length && Object.entries(now).every(([name, digest]) => shown[name] === digest);
  if (!kept) session.shown = now;
  if (carried.length === 0) return undefined;
  const more = differ.length - carried.length;
  return {
    files: carried.map(({ name, text, truncated, originalChars, limitChars }) => ({
      name,
      text,
      ...(truncated === undefined ? {} : { truncated }),
      ...(originalChars === undefined ? {} : { originalChars }),
      ...(limitChars === undefined ? {} : { limitChars }),
    })),
    ...(more > 0 ? { more } : {}),
  };
}

/** What an input carries of what was missed and the breadcrumbs it was handed. */
export function carrying(
  missed: Missed[],
  breadcrumbs?: Breadcrumbs,
): { missed: Missed[]; breadcrumbs?: Breadcrumbs } {
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

/** Keep what was missed, each once, oldest first. */
function keepMissed(session: SessionRecord, missed: readonly Missed[]): void {
  if (missed.length === 0) return;
  const byId = new Map([...copyOf(session.missed), ...missed].map((each) => [missedId(each), each]));
  session.missed = [...byId.values()].sort((a, b) => missedAt(a) - missedAt(b));
}

function missedId(missed: Missed): string {
  if (missed.kind === "watch") return missed.settled.watch.id;
  return missed.kind === "process" ? missed.event.eventId : missed.occurrence.id;
}

function missedAt(missed: Missed): number {
  if (missed.kind === "watch") return missed.settled.at;
  return missed.kind === "process" ? missed.event.at : missed.occurrence.firedAt;
}

/**
 * Keep what an input that was skipped was to show the model, for the session's
 * next input. A chat event is kept with the events that came with it. A settled
 * watch, a background command event and a one-time trigger don't come again, so
 * they are kept as missed; a standing trigger's next occurrence says the same, so
 * it isn't.
 */
export function keepSkipped(session: SessionRecord, input: Outstanding): void {
  if (isWatch(input)) keepMissed(session, [{ kind: "watch", settled: input.settled }]);
  else if (isProcess(input)) keepMissed(session, [{ kind: "process", event: input.process }]);
  else if (isOccurrence(input) && input.occurrence.trigger === null) keepMissed(session, [{ kind: "once", occurrence: input.occurrence }]);
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
