/**
 * What intake and the agent's sessions agree on, in Shrimpy's own terms.
 * Whatever stores the agent's records and runs its sessions implements
 * `Admissions` and `Working`; intake sees nothing of how. What is stored is
 * plain JSON, so these are type aliases, which TypeScript lets stand for JSON.
 */

import type { WakePolicies } from "./policy.ts";

/**
 * Who a message in a room was for, as the model is told: whether it was for the
 * agent, the other members it was for by name, and whether it was for everyone in
 * the room but its author. A message that mentions nobody is for none of them.
 */
export type Audience = {
  you: boolean;
  others: string[];
  everyone: boolean;
};

/**
 * A chat event as it was written, kept so the model can be shown it later. The
 * agent admits events, not messages: what it takes up is a post, an edit, a
 * reaction to a message of its own, or the reply that answers a message of its
 * own, and its receipt names that event: for a reply, the event that posted it.
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
      /** In a room, who it was for. A DM has none: every message in it is for the other member. */
      to?: Audience;
      /** When it was last edited, for a message that is shown as it now stands. */
      editedAt?: number;
      /** Whether `text` is only the start of what it says, cut because the rest was longer than there was room for. */
      clipped?: true;
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
      /** In a room, who it is for now. */
      to?: Audience;
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
    }
  | {
      kind: "answered";
      /** The ID of the event that posted the reply, which the agent admits it by and its receipt names. */
      id: string;
      /** The reply's position in chat's order, which is the order events are shown in. */
      seq: number;
      /** The name of the member who answered. */
      by: string;
      /** When the reply was written, and what it says. */
      at: number;
      text: string;
      /** When the message answered was sent, and the start of its text. It is one of the agent's own. */
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

/** A message of a thread, as the model reads one that arrives. */
export type Said = Extract<Snapshot, { kind: "posted" }>;

/**
 * What was said in a room's thread since the agent last looked, which an event
 * that wakes the agent there comes with. These are messages the agent has not
 * taken up as events of its own: it was only shown them. A command it acted on
 * is one of them.
 */
export type Backlog = {
  /** The newest of them that fit in what the model is shown, oldest first. */
  messages: Said[];
  /** How many earlier messages are not shown, or at least that many when `atLeast` is set. */
  cut: number;
  atLeast?: true;
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
   * In a room, what was said in the thread since the agent last looked, shown
   * to the model before the event. Present for every event that wakes the agent
   * in a room, with nothing in it when there was nothing to show, and absent in
   * a DM.
   */
  backlog?: Backlog;
  /**
   * Wake-ups the agent asked for that were cancelled since it last heard of
   * them, told to the model with this input, once. Absent when there are none.
   */
  cancelled?: Wakeup[];
  /**
   * Set when the message can't wait for the turn that is running: a person
   * wrote it and it mentions the agent, which is how a person says so. The turn
   * reads it at its next step, and its reply answers the message too. A turn
   * with no step left can't read it, and the next turn answers it. Absent for
   * every other input, which waits for the next turn, and so for one stored
   * before this existed.
   */
  urgent?: true;
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

/**
 * Whether an input can't wait for the turn that is running, which then reads it
 * at its next step. Only a chat event can be: what a wake-up or an occurrence
 * of a trigger has to say is for the next turn.
 */
export function isUrgent(outstanding: Outstanding): boolean {
  return isChat(outstanding) && outstanding.urgent === true;
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

/**
 * What intake needs from the agent's records: where it stands in chat's feed, a
 * way to take an event up, and a way to stop the work behind a thread, for a
 * command. It is also handed the choices the agent made, in a file of its home,
 * about what wakes it in each room.
 */
export interface Admissions {
  /** What wakes the agent in each room. Without it, every room has the default. */
  readonly wakes?: WakePolicies;
  /** Where the agent stands in chat's feed, kept with its own records. Undefined until it is first set. */
  cursor(): Promise<number | undefined>;
  /** Move past events that wake nobody. */
  setCursor(seq: number): Promise<void>;
  /**
   * Take an event up: make its thread's session if the thread has none, start
   * the task that follows the event to its receipt, and move the cursor to
   * `position`, all in one commit. `position` is where the feed brought the
   * event, which is the event's own position unless it is a reply that a receipt
   * pointed to. The thread's earlier unacted events go with it, and so do the
   * wake-ups cancelled since the model last heard of them. An event in a room,
   * one with a `backlog`, also moves where the agent has looked in its thread to
   * the event. An event is taken up once, because the cursor moves with it.
   */
  admit(draft: Omit<ChatInput, "earlier" | "cancelled">, position?: number): Promise<void>;
  /**
   * Where the agent last looked in a thread of a room: the position of the
   * newest event it took up there, kept with the thread's session. Undefined
   * for a thread it has never been woken in. Everything the thread says after
   * that position is what the agent has not seen.
   */
  looked(threadId: string): Promise<number | undefined>;
  /**
   * Stop the work of the session behind a thread, as stopping it from a client
   * does: the turn that is running is stopped, the inputs that wait are taken
   * back, and the wake-ups the session waits on are cancelled. The inputs'
   * sources are told as they would be of any stop. It does nothing when the
   * agent has no session there or the session has nothing to stop, and it leaves
   * the agent's other sessions alone. It resolves once the work has stopped.
   */
  stopWork(threadId: string): Promise<void>;
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
