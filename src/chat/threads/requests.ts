import { createHash } from "node:crypto";
import type { Member, Message } from "../../contracts/chat/index.ts";
import { identifier } from "../input/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import type { Transaction } from "../store/index.ts";

/** A member's own ID for a request it makes of a message, and what the request said. */
export interface Request {
  id: string;
  digest: string;
}

/**
 * The request `requestId`, saying `parts`. A message can be edited or deleted
 * after a request names it, so a retry is told from a different request that
 * reuses the ID by what the request said, not by what the message says now. A
 * post says its thread and text, and a change to a message says first what
 * kind of change it is.
 */
export function requestOf(requestId: unknown, ...parts: string[]): Request {
  return { id: identifier(requestId, "request"), digest: createHash("sha256").update(parts.join("\0")).digest("hex") };
}

/**
 * Do what the caller's request asks, once. A request ID's first use wins: a
 * retry answers with the message the first use posted or changed, as it now
 * stands, and changes nothing, so a replayed old change can't undo a newer
 * one. An ID used before for something else is refused, since going ahead
 * would hide the mistake. The request is kept even when it changes nothing,
 * so that it can't take effect later.
 */
export function once(tx: Transaction, caller: Member, request: Request, act: () => Message): { message: Message; retry: boolean } {
  const earlier = tx.requested(caller.id, request.id);
  if (earlier !== undefined) {
    if (earlier.digest !== request.digest) refuse(`Request ${request.id} was used before for something else.`);
    return { message: earlier.message, retry: true };
  }
  const message = act();
  tx.keepRequest(caller.id, request.id, message.seq, request.digest);
  return { message, retry: false };
}
