import type { ChatClient, ChatEvent } from "../../contracts/chat/index.ts";
import type { Question, QuestionResult } from "../inputs/index.ts";
import { findReply } from "./answer.ts";
import type { Receipted } from "./wake.ts";

/**
 * What an event means to a question the agent has open: it belongs to the
 * question, or it is the receipt that closes it.
 */
export type Asked = { kind: "belongs" } | { kind: "receipt"; question: Question; receipt: Receipted };

/**
 * What an event means to the questions the agent has open, or nothing when it is
 * none of their business. The agent asked the member `question.of` in the DM
 * thread `question.dm`. What that member posts or edits there after the question
 * belongs to the question and wakes nobody, so that two agents do not answer each
 * other in circles. The receipt that member leaves on the question's event says
 * how its turn for the question ended, and closes the question.
 */
export function toQuestion(event: ChatEvent, open: readonly Question[]): Asked | undefined {
  for (const question of open) {
    if (event.actor.id !== question.of.id || event.message.threadId !== question.dm) continue;
    if (event.kind === "receipted" && event.event === question.event) return { kind: "receipt", question, receipt: event };
    if ((event.kind === "posted" || event.kind === "edited") && event.seq > question.seq) return { kind: "belongs" };
  }
  return undefined;
}

/**
 * What came back for a question, from the receipt that closes it, or nothing for
 * a receipt that says the other agent skipped the question, which leaves it open:
 * the other agent is shown it with its next message, and leaves another receipt
 * then. A receipt that says answered points to the reply, which only chat can
 * give, so chat is asked for it. A reply that can't be found, or was taken back,
 * is not shown, and `onError` says it can't be found.
 */
export async function resultOf(
  chat: ChatClient,
  receipt: Receipted,
  signal: AbortSignal,
  onError: (error: Error) => void,
): Promise<QuestionResult | undefined> {
  switch (receipt.status) {
    case "skipped":
      return undefined;
    case "silent":
      return { kind: "silent" };
    case "stopped":
      return { kind: "stopped" };
    case "failed":
      return { kind: "failed", reason: receipt.detail ?? "" };
    case "answered": {
      const reply = receipt.reply === null ? undefined : await findReply(chat, receipt, receipt.reply, signal);
      if (reply === undefined) {
        onError(
          new Error(
            `The receipt ${receipt.id} says ${receipt.actor.name} answered a question of the agent's, but the reply it points to ` +
              "was not among the newest of its thread, so the result says only that it was answered.",
          ),
        );
      }
      return reply === undefined || reply.deleted ? { kind: "answered" } : { kind: "answered", reply: { text: reply.text, at: reply.sentAt } };
    }
  }
}
