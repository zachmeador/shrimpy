import type { ConversationId, Tx } from "@earendil-works/pi-durable";
import type { Breadcrumb, Outstanding } from "../inputs/index.ts";
import {
  carrying,
  keptPlace,
  plain,
  sessionAddress,
  SessionsDoc,
  takeBreadcrumbs,
  takeCancelled,
  takeEvents,
  takeMissed,
} from "../records/durable.ts";
import type { TurnTask } from "./turn-task.durable.ts";

/** An input as its source makes it: what its session kept for it is not in it yet. */
type Fresh = Outstanding extends infer Each ? (Each extends unknown ? Omit<Each, "earlier" | "cancelled" | "missed" | "breadcrumbs"> : never) : never;

/**
 * Take an input up, in the commit `tx` belongs to: take out of its session's
 * record what the session kept for its next input, because the model has not
 * been shown it, and create the task that follows the input, in the session's
 * conversation `conversationId`. Any input carries the wake-ups that were
 * cancelled and the results of questions the session was never shown, and a chat
 * event the events nobody acted on. It also carries the `breadcrumbs` that differ
 * from what the session was last shown, and the session's record says it was
 * shown them. They were read before the commit, since a commit reads no files. An
 * input in a thread also carries where the session says the thread is, if it has
 * learned that, so that what the model was shown can be read back as it was. The
 * session is the one the input names, which is also where a skipped input is put
 * back. An occurrence that no session runs names none, and is taken up in the
 * conversation that owns it, taking nothing.
 * The task is a background task, so a stop of the session's work leaves it to
 * report how that ended.
 */
export async function takeUp(
  tx: Tx,
  turn: TurnTask,
  conversationId: ConversationId,
  input: Fresh,
  breadcrumbs: readonly Breadcrumb[],
): Promise<void> {
  const sessions = (await tx.doc(SessionsDoc)).sessions;
  const address = sessionAddress(input as Outstanding);
  const session = address !== undefined && Object.hasOwn(sessions, address) ? sessions[address] : undefined;
  const cancelled = session === undefined ? [] : takeCancelled(session);
  const missed = session === undefined ? [] : takeMissed(session);
  const crumbs = session === undefined ? undefined : takeBreadcrumbs(session, breadcrumbs);
  const carried = carrying(cancelled, missed, crumbs);
  const place = session === undefined ? undefined : keptPlace(session);
  const there = place === undefined ? {} : { place };
  const taken: Outstanding =
    "event" in input
      ? { ...plain(input), earlier: session === undefined ? [] : takeEvents(session), ...carried, ...there }
      : input.threadId === undefined
        ? { ...input, ...carried }
        : { ...input, ...carried, ...there };
  await tx.createTask(turn, taken, { ownership: { kind: "conversation" }, conversationId, background: true });
}
