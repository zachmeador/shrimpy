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
 * A wake-up the agent asked for with `check_back`, as it is kept and as the
 * model is told of it. It is for one session, at one time, and carries the note
 * the agent left itself.
 */
export type Wakeup = {
  /** Names the wake-up for as long as the agent's records last. */
  id: string;
  /** When the agent asked for it, and when it is for: milliseconds since the epoch. */
  askedAt: number;
  due: number;
  /** What the agent wanted to be told when it was woken, in its own words. */
  note: string;
};

/**
 * A chat event the agent took up and has not left its receipt on yet: the input
 * of the task that follows it, from the moment the event is taken up until its
 * receipt is left.
 */
export type ChatInput = {
  event: Snapshot;
  threadId: string;
  channelId: string;
  /**
   * Earlier events in the same thread that the agent had not acted on, such
   * as ones skipped when work was stopped, shown to the model with this one.
   * Oldest first. They get the same receipt as the event.
   */
  earlier: Snapshot[];
  /**
   * Wake-ups the agent asked for that were cancelled since it last heard of
   * them, told to the model with this input, once. Absent when there are none.
   */
  cancelled?: Wakeup[];
};

/**
 * A wake-up the agent asked for that has come due, taken up as the input of the
 * task that follows it. It has no one to tell how its turn ended: the turn's
 * final text is posted to the thread, and a failure is reported.
 */
export type WakeupInput = {
  wakeup: Wakeup;
  threadId: string;
  channelId: string;
  /** As for a chat event. */
  cancelled?: Wakeup[];
};

/**
 * An input the agent took up and has not finished with, from any source: what
 * the task that follows it is given, from the moment it is taken up until its
 * source is told how its turn ended. A chat event and a wake-up are told apart
 * by their shape. Code that handles an input of any source asks `isWakeup` and
 * `idOf` and does not look inside.
 */
export type Outstanding = ChatInput | WakeupInput;

/** Whether an input is a wake-up that came due, and not a chat event. */
export function isWakeup(outstanding: Outstanding): outstanding is WakeupInput {
  return "wakeup" in outstanding;
}

/**
 * The ID the agent's records know an input by, such as the count of crashes its
 * turn has lived through. It is the one its source gave it, which the source
 * does not reuse.
 */
export function idOf(outstanding: Outstanding): string {
  return isWakeup(outstanding) ? outstanding.wakeup.id : outstanding.event.id;
}

/** How the turn for an input ended. */
export type TurnOutcome =
  /** `answer` names the final answer within the thread's session, and `text` is its text. */
  | { kind: "answered"; answer: string; text: string }
  /** Someone stopped the work while the input's turn was running. */
  | { kind: "stopped" }
  /** The input was still waiting when work was stopped. */
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
   * it, and so do the wake-ups cancelled since the model last heard of them. An
   * event is taken up once, because the cursor moves with it.
   */
  admit(draft: Omit<ChatInput, "earlier" | "cancelled">): Promise<void>;
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
