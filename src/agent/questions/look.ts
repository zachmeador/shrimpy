import type { Question, QuestionResult } from "../inputs/index.ts";

/** What a look at chat found on a question: what the other agent's receipt says, and how far chat's log went when it was read. */
export interface Looked {
  result: QuestionResult;
  /** The position of the newest event of chat's log after the receipt was read: everything the other agent did that the look saw is at or before it. */
  through: number;
}

/** What the task that closes a question when its time is up asks of whoever can look at chat. */
export interface Look {
  /**
   * Look at the question's message in chat once, and say what the other agent has
   * left on it: its receipt, in the form the feed would have brought it. Nothing
   * when it has left none, or one that says it skipped the question, and nothing
   * when chat refuses for good to show the message, since there is nothing to wait
   * for. "later" when it could not look, as when chat is away, so that nothing is
   * never an answer to not having looked: the task sleeps and looks again. It ends
   * with a rejection only when `signal` aborts.
   */
  look(question: Question, signal: AbortSignal): Promise<Looked | undefined | "later">;
}
