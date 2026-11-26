import type { ModelId } from "../../contracts/agent/index.ts";
import type { Attachment, WakeLine } from "../../contracts/chat/index.ts";

/**
 * What an input is, in Shrimpy's own terms: a chat event, an occurrence of a
 * standing or one-shot trigger, a background `bash` process event, or a
 * settled watch on another agent, each as it is kept while the agent works on
 * it, and the helpers that ask an input what it is and where it is. What is
 * stored is plain JSON, so these are type aliases, which TypeScript lets stand
 * for JSON.
 */

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

/** A file that came with a message, as the model is told of it: its name, its media type and its size in bytes. */
export type Attached = { name: string; mediaType: string; size: number };

/** What a posted message's snapshot keeps of the files that came with it: nothing when none did. */
export function attachedOf(attachments: readonly Attachment[]): { attachments?: Attached[] } {
  return attachments.length === 0 ? {} : { attachments: attachments.map(({ name, mediaType, size }) => ({ name, mediaType, size })) };
}

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
      /** The files that came with it, in the order they were sent. Absent when none did. */
      attachments?: Attached[];
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
 * A live watch on another agent's reply in a DM thread. Created automatically
 * when this agent uses `post` to send a message into a DM with another agent,
 * and held open until that agent settles (leaves a non-`skipped` receipt on
 * the posted event), the DM thread is archived, or the watch is dropped.
 */
export type Watch = {
  /** Names the watch for as long as the agent's records last. */
  id: string;
  /** The thread that posted and is waiting for the reply. */
  fromThread: string;
  fromChannel: string;
  /** The agent being watched: member ID and name at the time of posting. */
  onAgent: { id: string; name: string };
  /** The DM thread with that agent. */
  toThread: string;
  /** When the watched post was sent: milliseconds since the epoch. */
  startedAt: number;
  /** The start of what was posted, on one line. */
  start: string;
  /** The posted message, the event that posted it, and its position in chat's order. */
  message: string;
  event: string;
  seq: number;
};

/** What came back when a watched agent settled. */
export type WatchResult =
  /** The watched agent answered. `reply` is absent when the reply could not be read. */
  | { kind: "answered"; reply?: { text: string; at: number } }
  /** It read the post and wrote nothing (`END`). */
  | { kind: "silent" }
  /** Its turn failed, for the reason its receipt gives. */
  | { kind: "failed"; reason: string }
  /** Its work was stopped before it answered. */
  | { kind: "stopped" };

/** A watch that settled, with what came back and when. */
export type WatchSettled = {
  watch: Pick<Watch, "id" | "onAgent" | "toThread" | "startedAt" | "start">;
  result: WatchResult;
  at: number;
};

/** Another watch still open for the same calling thread when a watch settles. */
export type PendingWatch = {
  agent: string;
  thread: string;
};

/** A background `bash` command event that wakes its owning thread. */
export type ProcessEvent = {
  /** Unique ID for this wake event (`proc_...` on end, `proc_...:checkin` on 15m check-in). */
  eventId: string;
  /** The process ID (`proc_...`). */
  id: string;
  command: string;
  state: "exited" | "killed" | "checkin" | "interrupted";
  code: number | null;
  startedAt: number;
  at: number;
  afterMs: number;
  /** Recent output tail. */
  output: string;
  /** Full output log path on disk. */
  logPath: string;
};

/** Someone in a channel, as the model is told of them: a name, and whether they are a person or an agent. */
export type Named = { name: string; kind: "person" | "agent" };

/** Which thread of a channel: its name, if it has one. */
type Which = { name: string | null };

/**
 * Where a thread is, as chat said when the agent last took something up there,
 * and as an input tells the model: the agent's DM with one other member, or a
 * room and who else is in it. A room names at most a dozen of the others, and
 * `more` counts the rest. Names are as they were then, since a member or a room
 * can be renamed after.
 */
export type Place =
  | { kind: "dm"; with: Named; thread: Which }
  | { kind: "room"; room: string; others: Named[]; more?: number; thread: Which };

/** A message of a thread, as the model reads one that arrives. */
export type Said = Extract<Snapshot, { kind: "posted" }>;

/** A wake line among what was said in a thread: what woke an agent and when. */
export type Fired = { kind: "fired"; id: string; seq: number; wake: WakeLine };

/**
 * What was said in a thread since the agent last looked, which an event that
 * wakes the agent there comes with. These are messages the agent has not taken
 * up as events of its own: it was only shown them. What it posted there from
 * its other sessions is among them.
 */
export type Backlog = {
  /** The newest of them that fit in what the model is shown, oldest first. */
  messages: (Said | Fired)[];
  /** How many earlier messages are not shown, or at least that many when `atLeast` is set. */
  cut: number;
  atLeast?: true;
};

/**
 * That the model that wrote a session's last answer is not the one the session
 * runs on now, which the model is told with the next input it is handed. It is
 * worked out from the session's records when the input is handed over, and is
 * not kept, so it covers every reason a session's model changes and is told
 * once, since the next answer is written by the model that runs on.
 */
export type ModelChange = { was: ModelId; now: ModelId };

/** A breadcrumb as the model is shown it: the name of its file, and its text, which is already cut to what is shown. */
export type Breadcrumb = { name: string; text: string };

/**
 * The breadcrumbs an input carries: the files of the home's `breadcrumbs/` that
 * differ from what its session was last shown, which the session is shown with
 * this input, before the rest of it. `more` is how many others differ and wait for
 * later inputs, when there are more than an input carries.
 */
export type Breadcrumbs = { files: Breadcrumb[]; more?: number };

/** The thread a session sits behind, and where it is when the session knows. */
type InThread = { threadId: string; channelId: string; place?: Place };

/**
 * A chat event the agent took up and has not left its receipt on yet: the input
 * of the task that follows it, from the moment the event is taken up until its
 * receipt is left.
 */
export type ChatInput = InThread & {
  event: Snapshot;
  /**
   * Earlier events in the same thread that the agent had not acted on, such
   * as ones skipped when work was stopped, shown to the model with this one.
   * Oldest first. They get the same receipt as the event.
   */
  earlier: Snapshot[];
  /**
   * What was said in the thread since the agent last looked, shown to the model
   * before the event. Present for every event that wakes the agent, with nothing
   * in it when there was nothing to show.
   */
  backlog?: Backlog;
  /**
   * Settled watches that this session was never shown because the input they
   * came as was taken back by a stop or a failed turn ahead of it.
   */
  missed: WatchSettled[];
  /** The breadcrumbs that are new to the session, shown before anything else of the input. Absent when there are none. */
  breadcrumbs?: Breadcrumbs;
  /**
   * Set when the message joins the turn that is running: a person wrote it.
   * The turn reads it at its next step, once the tools of the step it is on
   * have finished, and its reply answers the message too.
   */
  urgent?: true;
};

/**
 * An occurrence of a standing or one-shot trigger, as it was when it fired.
 * For a standing trigger `trigger` is its name and `schedule` is its schedule
 * in words. For a one-shot trigger both are `null` and `askedAt` says when it
 * was scheduled.
 */
export type Occurrence = {
  /** Names the occurrence for as long as the agent's records last. */
  id: string;
  trigger: string | null;
  /** When it was due, and when it fired: milliseconds since the epoch. A run by hand is due when it fires. */
  due: number;
  firedAt: number;
  byHand: boolean;
  /** The trigger's schedule in words, or null for a one-shot trigger. */
  schedule: string | null;
  /** When a one-shot trigger was scheduled, in milliseconds since the epoch. */
  askedAt?: number;
  /** What the trigger is to do. */
  prompt: string;
  /**
   * What the trigger's check printed, or the line that says it failed, for an
   * occurrence the check's news woke the agent with. Absent for one with no check.
   */
  output?: string;
};

/**
 * An occurrence of a trigger, taken up as the input of the task that follows
 * it. Every running occurrence belongs to a thread; `unrun` occurrences
 * (skipped, noted to a breadcrumb, failed to reach their thread, or check
 * interrupted) end immediately without a thread or turn.
 */
export type OccurrenceInput = {
  occurrence: Occurrence;
  missed: WatchSettled[];
  breadcrumbs?: Breadcrumbs;
  unrun?: { outcome: "skipped" | "failed" | "noted" | "interrupted"; reason: string };
} & (InThread | { threadId?: undefined; channelId?: undefined; place?: undefined });

/** A background `bash` process event waking the session that started it. */
export type ProcessInput = InThread & {
  process: ProcessEvent;
  missed: WatchSettled[];
  breadcrumbs?: Breadcrumbs;
};

/** A settled watch waking the calling thread with what the other agent did. */
export type WatchInput = InThread & {
  settled: WatchSettled;
  pending: PendingWatch[];
  missed: WatchSettled[];
  breadcrumbs?: Breadcrumbs;
};

/**
 * An input the agent took up and has not finished with, from any source.
 */
export type Outstanding = ChatInput | OccurrenceInput | ProcessInput | WatchInput;

/** Whether an input is a chat event. */
export function isChat(outstanding: Outstanding): outstanding is ChatInput {
  return "event" in outstanding;
}

/** Whether an input is an occurrence of a trigger (standing or one-shot). */
export function isOccurrence(outstanding: Outstanding): outstanding is OccurrenceInput {
  return "occurrence" in outstanding;
}

/** Whether an input is a background `bash` process event. */
export function isProcess(outstanding: Outstanding): outstanding is ProcessInput {
  return "process" in outstanding;
}

/** Whether an input is a settled watch on another agent. */
export function isWatch(outstanding: Outstanding): outstanding is WatchInput {
  return "settled" in outstanding;
}

/**
 * The ID the agent's records know an input by, such as in the request ID it is
 * handed to its session with.
 */
export function idOf(outstanding: Outstanding): string {
  if (isOccurrence(outstanding)) return outstanding.occurrence.id;
  if (isProcess(outstanding)) return outstanding.process.eventId;
  if (isWatch(outstanding)) return outstanding.settled.watch.id;
  return outstanding.event.id;
}

/**
 * The thread an input's session is behind, which its reply is posted to and
 * which is marked as working while it runs; undefined only for an unrun
 * occurrence.
 */
export function threadOf(outstanding: Outstanding): { threadId: string; channelId: string } | undefined {
  return outstanding.threadId === undefined ? undefined : { threadId: outstanding.threadId, channelId: outstanding.channelId };
}

/**
 * Whether the source of an input wants a receipt: every chat event and every
 * in-thread wake line (trigger, process, or watch answer) gets a receipt.
 */
export function hasReceipt(outstanding: Outstanding): boolean {
  return isChat(outstanding) || threadOf(outstanding) !== undefined;
}

/**
 * Whether an input joins the turn that is running, which then reads it at its
 * next step. Only a person's chat post can.
 */
export function isUrgent(outstanding: Outstanding): boolean {
  return isChat(outstanding) && outstanding.urgent === true;
}

/** How the turn of an input ended, as the record of its task keeps it. */
export type Ending = {
  ended: "answered" | "silent" | "failed" | "stopped" | "skipped" | "noted" | "interrupted";
  /** Why a turn failed, or an occurrence was skipped, noted or interrupted, when it says. */
  reason?: string;
};

/** How the turn for an input ended. */
export type TurnOutcome =
  | { kind: "answered"; answer: string; text: string; cut?: true }
  | { kind: "stopped" }
  | { kind: "skipped"; reason?: string }
  | { kind: "failed"; reason: string };
