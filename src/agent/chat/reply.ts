import { createHash } from "node:crypto";

/**
 * Split text into messages of at most `limit` characters. A part ends where a
 * line does when it can end in the later half of what fits, and never splits a
 * character that takes two code units. Parts with nothing in them are dropped,
 * because chat does not take them.
 */
export function inParts(text: string, limit: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    const cut = cutPoint(rest, limit);
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  parts.push(rest);
  return parts.filter((part) => part.trim() !== "");
}

function cutPoint(text: string, limit: number): number {
  const lineBreak = text.lastIndexOf("\n", limit - 1);
  if (lineBreak >= limit / 2) return lineBreak + 1;
  const last = text.charCodeAt(limit - 1);
  const splitsAPair = last >= 0xd800 && last <= 0xdbff;
  return Math.max(splitsAPair ? limit - 1 : limit, 1);
}

/** The first `limit` characters, ending in an ellipsis when something was cut, without splitting a two-unit character. */
export function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const last = text.charCodeAt(limit - 2);
  const splitsAPair = last >= 0xd800 && last <= 0xdbff;
  return `${text.slice(0, splitsAPair ? limit - 2 : limit - 1)}…`;
}

/**
 * Names a posted reply by the agent's records, the thread's session and the
 * answer it carries, and by which part of the answer it is, so a retry posts
 * nothing twice and several messages answered by one turn share one reply. The
 * engine numbers its entries again in a new database, so what the records are
 * called keeps a reply made after a fresh start from being taken for a retry of
 * an older one.
 */
export function replyRequestId(recordsId: string, threadId: string, answer: string, part: number): string {
  return `reply-${recordsId}-${threadId}-${answer}-${part}`;
}

/**
 * Names the line an agent says about a command by the command's event and by the
 * line itself. Posting the same line again is a retry that posts nothing twice,
 * and a line that differs from the one an earlier run posted, as when that run
 * changed a model before it went down and the next finds it changed already, is
 * posted too, where under one name chat would refuse it as a different text.
 */
export function commandReplyRequestId(eventId: string, line: string): string {
  return `command-${eventId}-${createHash("sha256").update(line).digest("hex").slice(0, 16)}`;
}
