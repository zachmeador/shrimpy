import { oneLine } from "../../lib/plain/index.ts";
import type { Receipt } from "./shapes.ts";

/**
 * What a receipt says that a person needs to know, with `who` that left it:
 * "scout failed: …", "scout stopped before answering", "scout skipped this
 * message: …" or "scout skipped this message, because its work was stopped",
 * in the terminal and the commands alike, which each frame it their own way. An
 * answer is the message that follows, and a silent receipt is data nobody is
 * shown, so neither says anything. The name and the detail are put on one line
 * and made harmless here.
 */
export function receiptWords(receipt: Receipt, who: string): string | undefined {
  const name = oneLine(who);
  switch (receipt.status) {
    case "answered":
    case "silent":
      return undefined;
    case "failed":
      return `${name} failed: ${oneLine(receipt.detail ?? "")}`;
    case "stopped":
      return `${name} stopped before answering`;
    // A skipped receipt has no reason only when work was stopped.
    case "skipped":
      return receipt.detail === null
        ? `${name} skipped this message, because its work was stopped`
        : `${name} skipped this message: ${oneLine(receipt.detail)}`;
  }
}

/** What a member in no rooms is told. */
export const NO_ROOMS = "You are in no rooms.";

/**
 * That the caller is in no room called `name`, written without its `#`, and
 * the rooms it is in, by their names: "You are not in a room called #ops. The
 * rooms you are in: #general." A room the caller isn't in is not told apart
 * from one there is none of. The agent's tools and the commands each frame it
 * their own way.
 */
export function notInRoom(name: string, rooms: readonly string[]): string {
  const where = rooms.length === 0 ? NO_ROOMS : `The rooms you are in: ${rooms.map((room) => `#${room}`).join(", ")}.`;
  return `You are not in a room called #${name}. ${where}`;
}
