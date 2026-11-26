import type { ConversationId, Tx } from "@earendil-works/pi-durable";
import type { Breadcrumb, Outstanding } from "../inputs/index.ts";
import {
  carrying,
  copyOf,
  keptPlace,
  sessionAddress,
  SessionsDoc,
  takeBreadcrumbs,
  takeEvents,
  takeMissed,
} from "../records/durable.ts";
import type { TurnTask } from "./turn-task.durable.ts";

/** An input as its source makes it: what its session kept for it is not in it yet. */
type Fresh = Outstanding extends infer Each ? (Each extends unknown ? Omit<Each, "earlier" | "missed" | "breadcrumbs"> : never) : never;

/**
 * Take an input up, in the commit `tx` belongs to: take out of its session's
 * record what the session kept for its next input, and create the task that
 * follows the input in the session's conversation `conversationId`.
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
  const missed = session === undefined ? [] : takeMissed(session);
  const crumbs = session === undefined ? undefined : takeBreadcrumbs(session, breadcrumbs);
  const carried = carrying(missed, crumbs);
  const place = session === undefined ? undefined : keptPlace(session);
  const there = place === undefined ? {} : { place };
  const taken: Outstanding =
    "event" in input
      ? { ...copyOf(input), earlier: session === undefined ? [] : takeEvents(session), ...carried, ...there }
      : input.threadId === undefined
        ? { ...input, ...carried }
        : { ...input, ...carried, ...there };
  await tx.createTask(turn, taken, { ownership: { kind: "conversation" }, conversationId, background: true });
}
