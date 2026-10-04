/**
 * What intake needs from the agent's sessions and records, in Shrimpy's own
 * terms. Whatever stores the agent's records and runs its sessions implements
 * `Turns`; intake sees nothing of how. Every value that is stored is plain JSON.
 */

/** A chat message as it was written, kept so the model can be shown it later. */
export interface Snapshot {
  id: string;
  /** Its position in chat's order, which is the order messages are shown in. */
  seq: number;
  /** The author's name. */
  author: string;
  text: string;
  sentAt: number;
}

/**
 * A message the agent picked up and has not left its receipt on yet: the
 * agent's outbox holds one for each, from the moment the message is taken until
 * its receipt is left.
 */
export interface Outstanding {
  message: Snapshot;
  threadId: string;
  channelId: string;
  /**
   * Earlier messages in the same thread that the agent had not acted on, such
   * as ones skipped when work was stopped, shown to the model with this one.
   * Oldest first. They get the same receipt as the message.
   */
  earlier: Snapshot[];
}

/** How the turn for a message ended. */
export type TurnOutcome =
  /** `answer` names the final answer within the thread's session, and `text` is its text. */
  | { kind: "answered"; answer: string; text: string }
  /** Someone stopped the work while the message's turn was running. */
  | { kind: "stopped" }
  /** The message was still waiting when work was stopped. */
  | { kind: "skipped" }
  /** The turn ended without an answer for any other reason: `reason` is short and a person can read it. */
  | { kind: "failed"; reason: string };

/** The turn a message became. */
export interface Turn {
  /** Resolves when the message's input has ended, however it ended. Rejects if `signal` aborts first. */
  ended(signal: AbortSignal): Promise<void>;
  /** How it ended. Ask after `ended` has resolved. */
  outcome(): Promise<TurnOutcome>;
}

export interface Turns {
  /** Where the agent stands in chat's feed, kept with its own records. Undefined until it is first set. */
  cursor(): Promise<number | undefined>;
  setCursor(seq: number): Promise<void>;

  /**
   * Write down that a message was picked up: make its thread's session if the
   * thread has none, and add the message to the outbox, together. Taking the
   * thread's earlier unacted messages along is part of it. Repeating it for a
   * message already recorded gives the same record, and for one whose receipt
   * was already left gives undefined.
   */
  record(draft: Omit<Outstanding, "earlier">): Promise<Outstanding | undefined>;
  /**
   * Hand the text to the message's session as queued input, so it is answered
   * after any work already there. The input is named for the message, so
   * repeating this for the same message changes nothing.
   */
  start(outstanding: Outstanding, text: string): Promise<Turn>;
  /** The messages recorded and not yet settled, oldest first. */
  outstanding(): Promise<Outstanding[]>;
  /**
   * The receipt for a message is left: take it out of the outbox. A message
   * that was skipped stays unacted, so the next turn in its thread shows it.
   */
  settle(outstanding: Outstanding, outcome: TurnOutcome): Promise<void>;
}
