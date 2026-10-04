/**
 * What intake needs from the agent's sessions and records, in Shrimpy's own
 * terms. Whatever stores the agent's records and runs its sessions implements
 * `Turns`; intake sees nothing of how. What is stored is plain JSON, so these
 * are type aliases, which TypeScript lets stand for JSON.
 */

/**
 * A chat event as it was written, kept so the model can be shown it later. The
 * agent admits events, not messages: what it takes up is a post, an edit, or a
 * reaction to a message of its own, and its receipt names that event.
 */
export type Snapshot =
  | {
      kind: "posted";
      /** The event's ID, which the agent admits it by and its receipt names. */
      id: string;
      /** Its position in chat's order, which is the order events are shown in. */
      seq: number;
      /** The author's name. */
      author: string;
      sentAt: number;
      text: string;
    }
  | {
      kind: "edited";
      id: string;
      seq: number;
      /** The author's name, who is also the one who edited. */
      author: string;
      /** When the message was first sent. */
      sentAt: number;
      /** When it was edited. */
      at: number;
      /** What the message says now. */
      text: string;
    }
  | {
      kind: "reacted";
      id: string;
      seq: number;
      /** The name of the member who reacted. */
      by: string;
      at: number;
      emoji: string;
      /** When the message reacted to was sent, and the start of its text. It is one of the agent's own. */
      sentAt: number;
      start: string;
    };

/**
 * An event the agent picked up and has not left its receipt on yet: the
 * agent's outbox holds one for each, from the moment the event is taken until
 * its receipt is left.
 */
export type Outstanding = {
  event: Snapshot;
  threadId: string;
  channelId: string;
  /**
   * Earlier events in the same thread that the agent had not acted on, such
   * as ones skipped when work was stopped, shown to the model with this one.
   * Oldest first. They get the same receipt as the event.
   */
  earlier: Snapshot[];
};

/** How the turn for an event ended. */
export type TurnOutcome =
  /** `answer` names the final answer within the thread's session, and `text` is its text. */
  | { kind: "answered"; answer: string; text: string }
  /** Someone stopped the work while the event's turn was running. */
  | { kind: "stopped" }
  /** The event was still waiting when work was stopped. */
  | { kind: "skipped" }
  /** The turn ended without an answer for any other reason: `reason` is short and a person can read it. */
  | { kind: "failed"; reason: string };

/** The turn an event became. */
export interface Turn {
  /** Resolves when the event's input has ended, however it ended. Rejects if `signal` aborts first. */
  ended(signal: AbortSignal): Promise<void>;
  /** How it ended. Ask after `ended` has resolved. */
  outcome(): Promise<TurnOutcome>;
}

export interface Turns {
  /** Where the agent stands in chat's feed, kept with its own records. Undefined until it is first set. */
  cursor(): Promise<number | undefined>;
  setCursor(seq: number): Promise<void>;

  /**
   * Write down that an event was picked up: make its thread's session if the
   * thread has none, and add the event to the outbox, together. Taking the
   * thread's earlier unacted events along is part of it. Repeating it for an
   * event already recorded gives the same record, and for one whose receipt
   * was already left gives undefined.
   */
  record(draft: Omit<Outstanding, "earlier">): Promise<Outstanding | undefined>;
  /**
   * Hand the text to the event's session as queued input, so it is answered
   * after any work already there. The input is named for the event, so
   * repeating this for the same event changes nothing.
   */
  start(outstanding: Outstanding, text: string): Promise<Turn>;
  /**
   * Take back an event that is still waiting for its turn, as a stop does, so
   * its turn ends as skipped. One whose turn is running or has ended is left
   * alone.
   */
  withdraw(outstanding: Outstanding): Promise<void>;
  /** The events recorded and not yet settled, oldest first. */
  outstanding(): Promise<Outstanding[]>;
  /**
   * The receipt for an event is left: take it out of the outbox. An event
   * that was skipped stays unacted, so the next turn in its thread shows it.
   */
  settle(outstanding: Outstanding, outcome: TurnOutcome): Promise<void>;
}
