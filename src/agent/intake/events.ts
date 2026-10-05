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

/** The thread a session is behind, for an input that goes to one. */
type InThread = { threadId: string; channelId: string; trigger?: undefined };
/** What an input of a session behind no thread has in place of a thread. */
type NoThread = { threadId?: undefined; channelId?: undefined };

/**
 * A wake-up the agent asked for that has come due, taken up as the input of the
 * task that follows it. It has no one to tell how its turn ended: the turn's
 * final text is posted to the thread, if the session is behind one, and a
 * failure is reported. A session behind no thread is a trigger's own, and
 * `trigger` names the trigger.
 */
export type WakeupInput = {
  wakeup: Wakeup;
  /** As for a chat event. */
  cancelled?: Wakeup[];
} & (InThread | (NoThread & { trigger: string }));

/**
 * An occurrence of a trigger, as it was when it fired. The prompt and the
 * schedule are kept as they were then, so a later edit of the trigger's file
 * does not change what the record says ran.
 */
export type Occurrence = {
  /** Names the occurrence for as long as the agent's records last. */
  id: string;
  trigger: string;
  /** When it was due, and when it fired: milliseconds since the epoch. A run by hand is due when it fires. */
  due: number;
  firedAt: number;
  byHand: boolean;
  /** The trigger's schedule, as the model is told it. */
  schedule: string;
  /** What the trigger is to do, from its file. */
  prompt: string;
};

/**
 * An occurrence of a standing trigger, taken up as the input of the task that
 * follows it. Like a wake-up it has no one to tell how its turn ended: the
 * final text is posted to the trigger's thread if it names one, and a failure
 * is reported. With no thread it goes to a session of the trigger's own.
 */
export type OccurrenceInput = {
  occurrence: Occurrence;
  /** As for a chat event. */
  cancelled?: Wakeup[];
  /**
   * An occurrence that no turn runs: it was skipped because the last one was
   * still going, or could not be handed to a session. The task that follows it
   * ends at once with this outcome, and `reason` says why. It has no thread.
   */
  unrun?: { outcome: "skipped" | "failed"; reason: string };
} & (InThread | NoThread);

/**
 * An input the agent took up and has not finished with, from any source: what
 * the task that follows it is given, from the moment it is taken up until its
 * source is told how its turn ended. A chat event, a wake-up and an occurrence
 * of a trigger are told apart by their shape. Code that handles an input of any
 * source asks the helpers below and does not look inside.
 */
export type Outstanding = ChatInput | WakeupInput | OccurrenceInput;

/** Whether an input is a chat event. */
export function isChat(outstanding: Outstanding): outstanding is ChatInput {
  return "event" in outstanding;
}

/** Whether an input is a wake-up that came due. */
export function isWakeup(outstanding: Outstanding): outstanding is WakeupInput {
  return "wakeup" in outstanding;
}

/** Whether an input is an occurrence of a trigger. */
export function isOccurrence(outstanding: Outstanding): outstanding is OccurrenceInput {
  return "occurrence" in outstanding;
}

/**
 * The ID the agent's records know an input by, such as the count of crashes its
 * turn has lived through. It is the one its source gave it, which the source
 * does not reuse.
 */
export function idOf(outstanding: Outstanding): string {
  if (isWakeup(outstanding)) return outstanding.wakeup.id;
  if (isOccurrence(outstanding)) return outstanding.occurrence.id;
  return outstanding.event.id;
}

/**
 * The thread an input's session is behind, which its reply is posted to and
 * which is marked as working while it runs; undefined for a session behind no
 * thread, whose replies go nowhere.
 */
export function threadOf(outstanding: Outstanding): { threadId: string; channelId: string } | undefined {
  return outstanding.threadId === undefined ? undefined : { threadId: outstanding.threadId, channelId: outstanding.channelId };
}

/** Whether the source of an input wants a receipt: a chat event does, and nothing else has anyone to leave one for. */
export function hasReceipt(outstanding: Outstanding): boolean {
  return isChat(outstanding);
}

/** How the turn of an input ended, as the record of its task keeps it. */
export type Ending = {
  ended: "answered" | "silent" | "failed" | "stopped" | "skipped";
  /** Why a turn failed or an occurrence was skipped, when it says. */
  reason?: string;
};

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

/** What the agent's sessions know of the inputs it took up and has not finished telling their sources about yet. */
export interface Working {
  /** The threads those inputs are in. A session behind no thread is in none. */
  threads(): Promise<ReadonlySet<string>>;
  /** Call `listener` after the answer to `threads()` may have changed. Returns what stops that. */
  onChange(listener: () => void): () => void;
  /** Resolve once every input whose turn has ended has been told to its source, or `signal` aborts. A turn still running is not waited for. */
  untilTold(signal: AbortSignal): Promise<void>;
}
