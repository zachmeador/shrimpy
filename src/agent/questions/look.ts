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
   * when it has left none, or one that says it skipped the question. It waits for
   * chat when chat is not there, and tries again after a failure, so that "nothing"
   * is never an answer to not having looked; but chat refusing for good to show the
   * message is also nothing, since there is nothing to wait for. It ends with a
   * rejection only when `signal` aborts.
   */
  look(question: Question, signal: AbortSignal): Promise<Looked | undefined>;
}
