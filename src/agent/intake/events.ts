/**
 * What intake and the agent's sessions agree on, in Shrimpy's own terms.
 * Whatever stores the agent's records and runs its sessions implements
 * `Admissions` and `Working`; intake sees nothing of how. What is stored is
 * plain JSON, so these are type aliases, which TypeScript lets stand for JSON.
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
 * An event the agent took up and has not left its receipt on yet: the input of
 * the task that follows it, from the moment the event is taken up until its
 * receipt is left.
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

/** What intake needs from the agent's records: where it stands in chat's feed, and a way to take an event up. */
export interface Admissions {
  /** Where the agent stands in chat's feed, kept with its own records. Undefined until it is first set. */
  cursor(): Promise<number | undefined>;
  /** Move past events that wake nobody. */
  setCursor(seq: number): Promise<void>;
  /**
   * Take an event up: make its thread's session if the thread has none, start
   * the task that follows the event to its receipt, and move the cursor past
   * the event, all in one commit. The thread's earlier unacted events go with
   * it. An event is taken up once, because the cursor moves with it.
   */
  admit(draft: Omit<Outstanding, "earlier">): Promise<void>;
}

/** What the agent's sessions know of the events it took up and has not left a receipt on yet. */
export interface Working {
  /** The threads those events are in. */
  threads(): Promise<ReadonlySet<string>>;
  /** Call `listener` after the answer to `threads()` may have changed. Returns what stops that. */
  onChange(listener: () => void): () => void;
  /** Resolve once the receipt is left on every event whose turn has ended, or `signal` aborts. A turn still running is not waited for. */
  untilTold(signal: AbortSignal): Promise<void>;
}
