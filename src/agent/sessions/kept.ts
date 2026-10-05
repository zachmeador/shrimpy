import { isChat, isWakeup, type Outstanding, type Snapshot, type Wakeup } from "../chat/index.ts";
import { plain, type SessionRecord } from "./documents.ts";

/*
 * What a session keeps in its record for its next input, because the model has
 * not been shown it: chat events nobody acted on, and wake-ups that were
 * cancelled. It is taken out of the record in the commit that admits the input
 * it goes with, so it is told once, and put back if that input is skipped.
 */

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
 * What an input carries of the cancelled wake-ups it was handed: nothing when
 * there are none, so that an input with none is stored as it was before
 * wake-ups existed.
 */
export function carrying(cancelled: Wakeup[]): { cancelled?: Wakeup[] } {
  return cancelled.length === 0 ? {} : { cancelled };
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
 * since the agent has moved past them.
 */
export function keepSkipped(session: SessionRecord, input: Outstanding): void {
  if (isWakeup(input)) keepCancelled(session, [input.wakeup]);
  else if (isChat(input)) {
    session.unacted = inOrder([...plain(session.unacted), ...input.earlier, ...(input.backlog?.messages ?? []), input.event]);
  }
  keepCancelled(session, input.cancelled ?? []);
}

/** Events by position in chat's order, each once. */
function inOrder(events: Snapshot[]): Snapshot[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  return [...byId.values()].sort((a, b) => a.seq - b.seq);
}
