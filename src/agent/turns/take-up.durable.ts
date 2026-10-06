import type { ConversationId, Tx } from "@earendil-works/pi-durable";
import type { Breadcrumb, Outstanding } from "../inputs/index.ts";
import {
  carrying,
  plain,
  sessionAddress,
  SessionsDoc,
  takeBreadcrumbs,
  takeCancelled,
  takeEvents,
} from "../records/durable.ts";
import type { TurnTask } from "./turn-task.durable.ts";

/** An input as its source makes it: what its session kept for it is not in it yet. */
type Fresh = Outstanding extends infer Each ? (Each extends unknown ? Omit<Each, "earlier" | "cancelled" | "breadcrumbs"> : never) : never;

/**
 * Take an input up, in the commit `tx` belongs to: take out of its session's
 * record what the session kept for its next input, because the model has not
 * been shown it, and create the task that follows the input, in the session's
 * conversation `conversationId`. Any input carries the wake-ups that were
 * cancelled, and a chat event the events nobody acted on. It also carries the
 * `breadcrumbs` that differ from what the session was last shown, and the
 * session's record says it was shown them. They were read before the commit,
 * since a commit reads no files. The session is the one the input names, which is
 * also where a skipped input is put back. An occurrence that no session runs
 * names none, and is taken up in the conversation that owns it, taking nothing.
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
  const crumbs = session === undefined ? undefined : takeBreadcrumbs(session, breadcrumbs);
  const taken: Outstanding =
    "event" in input
      ? { ...plain(input), earlier: session === undefined ? [] : takeEvents(session), ...carrying(cancelled, crumbs) }
      : { ...input, ...carrying(cancelled, crumbs) };
  await tx.createTask(turn, taken, { ownership: { kind: "conversation" }, conversationId, background: true });
}
