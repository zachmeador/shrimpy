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
