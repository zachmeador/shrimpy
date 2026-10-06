import type { ConversationId, Tx } from "@earendil-works/pi-durable";
import type { Breadcrumb, QuestionInput, QuestionResult } from "../inputs/index.ts";
import { type OpenQuestion, plain, QuestionsDoc, SessionsDoc } from "../records/durable.ts";
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
 */
export async function closeQuestion(
  tx: Tx,
  turn: TurnTask,
  id: string,
  result: QuestionResult,
  breadcrumbs: readonly Breadcrumb[],
): Promise<Closed | undefined> {
  const doc = await tx.doc(QuestionsDoc);
  if (!Object.hasOwn(doc.open, id)) return undefined;
  const { task, ...question } = plain(doc.open[id]!);
  doc.open = without(doc.open, id);

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

/** The open questions without the one named `id`. */
function without(open: Record<string, OpenQuestion>, id: string): Record<string, OpenQuestion> {
  return Object.fromEntries(Object.entries(plain(open)).filter(([key]) => key !== id));
}
