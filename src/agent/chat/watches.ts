import type { ChatEvent, Message, Receipt } from "../../contracts/chat/index.ts";
import type { Watch, WatchResult } from "../inputs/index.ts";
import type { ChatCalls } from "../links/index.ts";
import { findReply } from "./answer.ts";
import type { Receipted } from "./wake.ts";

/** What an event means to an open watch: it belongs to the watched reply, or it is the receipt that settles it. */
export type Watched = { kind: "belongs" } | { kind: "receipt"; watch: Watch; receipt: Receipted };

/**
 * What an event means to open watches on other agents' DM threads.
 * While a watch is open on `toThread`, posts and edits by `onAgent` after
 * `watch.seq` belong to the watch and do not wake a session in `toThread`.
 * When `onAgent` leaves its receipt on `watch.event`, that settles the watch.
 */
export function toWatch(event: ChatEvent, open: readonly Watch[]): Watched | undefined {
  for (const watch of open) {
    if (event.actor.id !== watch.onAgent.id || event.message.threadId !== watch.toThread) continue;
    if (event.kind === "receipted" && event.event === watch.event) return { kind: "receipt", watch, receipt: event };
    const post = event.kind === "posted" || event.kind === "edited";
    if (post && event.seq > watch.seq) return { kind: "belongs" };
  }
  return undefined;
}

async function fromReceipt(
  { status, reply, detail }: Pick<Receipt, "status" | "reply" | "detail">,
  find: (reply: string) => Promise<Message | undefined>,
  missing: () => void,
): Promise<WatchResult | undefined> {
  switch (status) {
    case "skipped":
      return undefined;
    case "silent":
      return { kind: "silent" };
    case "stopped":
      return { kind: "stopped" };
    case "failed":
      return { kind: "failed", reason: detail ?? "" };
    case "answered": {
      const found = reply === null ? undefined : await find(reply);
      if (found === undefined) missing();
      return found === undefined || found.deleted ? { kind: "answered" } : { kind: "answered", reply: { text: found.text, at: found.sentAt } };
    }
  }
}

/** Extract the `WatchResult` from a settlement receipt event in the feed. */
export function resultOf(
  chat: ChatCalls,
  receipt: Receipted,
  signal: AbortSignal,
  onError: (error: Error) => void,
): Promise<WatchResult | undefined> {
  return fromReceipt(
    receipt,
    (reply) => findReply(chat, receipt.message.threadId, receipt.seq, reply, signal),
    () =>
      onError(
        new Error(
          `The receipt ${receipt.id} says ${receipt.actor.name} answered in a watched DM thread, but the reply it points to ` +
            "was not among the newest of its thread, so the result says only that it was answered.",
        ),
      ),
  );
}
