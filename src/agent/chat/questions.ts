import type { ChatClient, ChatEvent, Message, Receipt } from "../../contracts/chat/index.ts";
import { localTime } from "../../lib/time/index.ts";
import type { Question, QuestionResult } from "../inputs/index.ts";
import type { Looked } from "../questions/index.ts";
import { findReply } from "./answer.ts";
import type { Receipted } from "./wake.ts";

/**
 * What an event means to a question the agent has open: it belongs to the
 * question, or it is the receipt that closes it.
 */
export type Asked = { kind: "belongs" } | { kind: "receipt"; question: Question; receipt: Receipted };

/**
 * What an event means to the questions the agent asked, or nothing when it is none
 * of their business. Each question has a thread of its own, which the agent asked
 * the member `question.of` in. What that member posts or edits in it after the
 * question belongs to the question and wakes nobody, so that two agents do not
 * answer each other in circles, while the question is open, and for a question
 * that was closed by a look at chat, up to what the look saw. What the member
 * posts anywhere else is an ordinary message. The receipt that member leaves on
 * the question says how its turn for the question ended, and closes the question
 * if it is open.
 */
export function toQuestion(event: ChatEvent, kept: readonly Question[]): Asked | undefined {
  for (const question of kept) {
    if (event.actor.id !== question.of.id || event.message.threadId !== question.thread) continue;
    const open = question.through === undefined;
    if (open && event.kind === "receipted" && event.event === question.event) return { kind: "receipt", question, receipt: event };
    const post = event.kind === "posted" || event.kind === "edited";
    if (post && event.seq > question.seq && event.seq <= (question.through ?? Infinity)) return { kind: "belongs" };
  }
  return undefined;
}

/**
 * What came back for a question, from a receipt, or nothing for a receipt that
 * says the other agent skipped the question, which leaves it open: the other
 * agent is shown it with its next message, and leaves another receipt then. A
 * receipt that says answered points to the reply, which only chat can give, so
 * `find` is asked for it. A reply that can't be found, or was taken back, is not
 * shown, and `missing` says it can't be found.
 */
async function fromReceipt(
  { status, reply, detail }: Pick<Receipt, "status" | "reply" | "detail">,
  find: (reply: string) => Promise<Message | undefined>,
  missing: () => void,
): Promise<QuestionResult | undefined> {
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

/**
 * What came back for a question, from the receipt event that closes it in the
 * feed. `onError` is told when the reply it points to can't be found.
 */
export function resultOf(
  chat: ChatClient,
  receipt: Receipted,
  signal: AbortSignal,
  onError: (error: Error) => void,
): Promise<QuestionResult | undefined> {
  return fromReceipt(
    receipt,
    (reply) => findReply(chat, receipt.message.threadId, receipt.seq, reply, signal),
    () =>
      onError(
        new Error(
          `The receipt ${receipt.id} says ${receipt.actor.name} answered a question of the agent's, but the reply it points to ` +
            "was not among the newest of its thread, so the result says only that it was answered.",
        ),
      ),
  );
}

/**
 * Look at a question's message in chat once, for what the other agent's receipt
 * on it says, as the receipt event would have said it in the feed. Nothing came
 * back when the other agent has left no receipt on the question's event, or one
 * that says it skipped it. The newest message at or before the question's position
 * is the question itself. The position of the newest event is read after the
 * message, so that everything the other agent did that the look saw is behind it.
 * `onError` is told when the reply the receipt points to can't be found.
 */
export async function lookAt(
  chat: ChatClient,
  question: Question,
  signal: AbortSignal,
  onError: (error: Error) => void,
): Promise<Looked | undefined> {
  const [message] = await chat.read(question.thread, question.seq + 1, 1, signal);
  if (message?.id !== question.message) return undefined;
  const receipt = message.receipts.find((each) => each.memberId === question.of.id && each.event === question.event);
  if (receipt === undefined) return undefined;
  const result = await fromReceipt(
    receipt,
    (reply) => findReply(chat, question.thread, null, reply, signal),
    () =>
      onError(
        new Error(
          `The receipt of ${question.of.name} on the question asked of them at ${localTime(question.askedAt)} says they answered, ` +
            "but the reply it points to was not among the newest of their DM, so the result says only that they answered.",
        ),
      ),
  );
  return result === undefined ? undefined : { result, through: await chat.head(signal) };
}
