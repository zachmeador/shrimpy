import type { Context } from "@earendil-works/chord/context";
import type { ToolExecutionResult } from "@earendil-works/pi-durable";
import { isRefusal } from "../../lib/refusal/index.ts";
import { isUnavailable, type LiveChat } from "../links/index.ts";

/** A tool's answer: just these words. */
export const answer = (text: string): ToolExecutionResult => ({ output: [{ type: "text", text }] });

/** A tool's answer when it did not do what was asked: just these words, marked as an error. */
export const failure = (text: string): ToolExecutionResult => ({ isError: true, output: [{ type: "text", text }] });

/** How a call to chat failed. */
export type ChatFailure =
  /** The link dropped, or chat went away, before the call finished. */
  | { lost: true }
  /** Chat answered and said no, for this reason. */
  | { refused: string };

/**
 * Sort out why a call to chat failed. A failure that is not about chat, such as
 * the turn being stopped or a mistake in the code, is thrown again for the
 * engine to deal with.
 */
export function chatFailure(error: unknown, live: LiveChat, context: Context): ChatFailure {
  if (context.abortSignal?.aborted === true) throw error;
  if (live.lost.aborted || isUnavailable(error)) return { lost: true };
  if (isRefusal(error)) return { refused: error.message };
  throw error;
}

/** The signal that ends a call to chat: the connection being lost, or the turn being stopped. */
export function callSignal(live: LiveChat, context: Context): AbortSignal {
  return context.abortSignal === undefined ? live.lost : AbortSignal.any([live.lost, context.abortSignal]);
}
