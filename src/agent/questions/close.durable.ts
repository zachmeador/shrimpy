import type { ConversationId, Tx } from "@earendil-works/pi-durable";
import type { Breadcrumb, QuestionInput, QuestionResult } from "../inputs/index.ts";
import { FeedDoc, type OpenQuestion, plain, QuestionsDoc, SessionsDoc } from "../records/durable.ts";
import { takeUp, type TurnTask } from "../turns/durable.ts";

/** What is left of a question that was closed: the engine's ID for the task that sleeps until its time is up, which is not needed any more. */
export interface Closed {
  task: number;
}

/**
 * Close the question `id` and take what came back up as an input of the session
 * that asked, in the commit `tx` belongs to, so the question closes once and its
 * result is told once, whoever closes it and however often the agent stops
 * meanwhile. A question that is not open any more, because something else closed
 * it first, is left alone: nothing is taken up, and the answer is undefined.
 * `breadcrumbs` were read before the commit, which reads no files.
 *
 * `through` is given when a look at chat found the other agent's receipt: the
 * position of the newest event the look saw. If the agent's place in chat's feed
 * is behind it, the feed has yet to read what the other agent posted, which came
 * before the receipt and is part of the answer just taken up, so the question is
 * kept, closed, until the feed is past that, and what the feed reads of the other
 * agent meanwhile still belongs to it.
 */
export async function closeQuestion(
  tx: Tx,
  turn: TurnTask,
  id: string,
  result: QuestionResult,
  breadcrumbs: readonly Breadcrumb[],
  through?: number,
): Promise<Closed | undefined> {
  const doc = await tx.doc(QuestionsDoc);
  if (!Object.hasOwn(doc.open, id) || doc.open[id]!.through !== undefined) return undefined;
  const { task, ...question } = plain(doc.open[id]!);
  if (through !== undefined && ((await tx.doc(FeedDoc)).cursor ?? 0) < through) doc.open[id]!.through = through;
  else doc.open = without(doc.open, id);

  const sessions = (await tx.doc(SessionsDoc)).sessions;
  const session = Object.hasOwn(sessions, question.session) ? sessions[question.session] : undefined;
  if (session === undefined) throw new Error(`The session ${question.session}, which asked the question, is gone.`);
  const asked = { id, of: question.of, askedAt: question.askedAt, due: question.due, start: question.start };
  const input: QuestionInput =
    session.channelId === null
      ? { question: asked, result, trigger: session.trigger }
      : { question: asked, result, threadId: question.session, channelId: session.channelId };
  await takeUp(tx, turn, session.conversationId as ConversationId, input, breadcrumbs);
  return { task };
}

/** Close the question `id` and say nothing to anyone, in the commit `tx` belongs to. A question that is not open is left alone. */
export async function forgetQuestion(tx: Tx, id: string): Promise<void> {
  const doc = await tx.doc(QuestionsDoc);
  if (Object.hasOwn(doc.open, id)) doc.open = without(doc.open, id);
}

/**
 * Let go of the questions that a look closed, in the commit `tx` belongs to, once
 * the agent's place in chat's feed is at or past `position`: there is nothing left
 * of what they were kept for to read.
 */
export async function forgetPassed(tx: Tx, position: number): Promise<void> {
  const doc = await tx.doc(QuestionsDoc);
  const passed = (question: OpenQuestion): boolean => question.through !== undefined && question.through <= position;
  if (Object.values(doc.open).some(passed)) {
    doc.open = Object.fromEntries(Object.entries(plain(doc.open)).filter(([, question]) => !passed(question)));
  }
}

/** The questions without the one named `id`. */
function without(open: Record<string, OpenQuestion>, id: string): Record<string, OpenQuestion> {
  return Object.fromEntries(Object.entries(plain(open)).filter(([key]) => key !== id));
}
