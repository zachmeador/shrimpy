/**
 * Who a connection to the agent is, as the gateway's roster has them: a person
 * or an agent. The ID is the roster's and never changes.
 */
export interface Member {
  id: string;
  kind: "person" | "agent";
  name: string;
}

/** One thing a client draws for a session. */
export type SessionItem =
  | { type: "user"; text: string }
  | {
      type: "assistant";
      text: string;
      thinking: string;
      streaming: boolean;
      stopReason: string | null;
    }
  | {
      type: "tool";
      id: string;
      name: string;
      args: string;
      status: ToolStatus;
      output: string;
      notes: string[];
    }
  | { type: "marker"; marker: "reset" | "compaction" };

/** `interrupted` means the agent restarted mid-call and did not run the tool again. */
export type ToolStatus = "pending" | "running" | "done" | "error" | "interrupted";

export type SessionActivity =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "answering" }
  | { kind: "tool"; name: string }
  | { kind: "retrying"; error: string };

/** Input the session has accepted but not picked up yet. */
export interface QueuedInput {
  mode: "steer" | "followUp" | "write";
  text: string;
}

export interface SessionStatus {
  activity: SessionActivity;
  busy: boolean;
  queued: QueuedInput[];
  model: { provider: string; id: string } | null;
  usage: { input: number; output: number; cost: number };
}

/**
 * A session as clients see it. The agent builds it from committed state, so a
 * client that reattaches sees the same thing. Values are strict JSON: absent
 * facts are null, never undefined.
 */
export interface SessionView {
  items: SessionItem[];
  status: SessionStatus;
  /** How many committed entries the session holds. */
  entries: number;
}

/**
 * Where a session is, as the agent last knew it. A client can't always ask chat,
 * which tells nobody about a channel they are not in, so the agent says. The
 * names are as they were when the agent last took something up there: a member
 * or a room can be renamed since.
 */
export type SessionPlace =
  /** A thread of the agent's DM with one other member. */
  | { kind: "dm"; with: { name: string; kind: "person" | "agent" }; thread: ThreadPlace }
  /** A thread of a room the agent is in. */
  | { kind: "room"; room: string; thread: ThreadPlace }
  /** A trigger's own session, which is behind no thread. */
  | { kind: "trigger"; trigger: string };

/** Which thread of a channel: its main one, and its name if it has one. */
export interface ThreadPlace {
  main: boolean;
  name: string | null;
}

/**
 * A session as a list shows it. An agent has one session for each thread it
 * takes part in, and one for each trigger whose occurrences go to no thread.
 * Every session has an address at the agent: a thread's ID for a session behind
 * a thread, and `trigger:` followed by the trigger's name for a trigger's own
 * session, which is behind none. A client treats the address as a name and
 * never takes it apart.
 */
export interface SessionSummary {
  /** The session's address at the agent: what `attach` takes. */
  id: string;
  /** The thread the session is behind, or null for a session behind none. For one behind a thread, it is also the address. */
  threadId: string | null;
  /** The channel of that thread, or null for a session behind no thread. */
  channelId: string | null;
  /** Where the session is, in names, or null when the agent has not learned it. */
  place: SessionPlace | null;
  /** Whether the session has input it is answering or has queued. */
  working: boolean;
}

/**
 * When a trigger's occurrences come. `every` is how it was written, such as
 * `1h`, and counts from the last occurrence. `cron` has five fields and is the
 * next matching time in `timezone`, which is the machine's when the file left
 * it out.
 */
export type TriggerSchedule = { every: string } | { cron: string; timezone: string };

/**
 * What a trigger's check is. The command runs at each occurrence, before
 * anything is taken up, and decides whether there is news: with none, no turn is
 * made, no model is called and no occurrence is made. The agent keeps it in its
 * records, so it is a type alias, which TypeScript lets stand for JSON.
 */
export type Check = {
  /** The command line, run with the agent's shell from its home. */
  command: string;
  /**
   * What counts as news: output that `changed` since the last occurrence, which
   * a trigger's first always has, any `output` at all, or `always`. A check that
   * fails has a line about the failure for its output.
   */
  when: "changed" | "output" | "always";
  /**
   * What news does: `wake` the agent with the trigger's prompt and the output, which it reads as data and not as
   * instructions, or `note` the output in the home's `breadcrumbs/`, with the prompt above it, and wake nobody.
   */
  then: "wake" | "note";
  /** How long the check may run before it is stopped and counts as failed: a delay such as `30s` or `2m`, at most `10m`. */
  timeout: string;
};

/**
 * How an occurrence ended. A skipped occurrence never ran: the last one was still
 * going, or there was nowhere to send it. A noted one ran its check, which found
 * news, and wrote it to a breadcrumb, so nobody was woken. An interrupted one was
 * running its check when the agent ended, and the check was not run again for it.
 * A check that finds no news makes no occurrence.
 */
export type OccurrenceEnding = "answered" | "silent" | "failed" | "stopped" | "skipped" | "noted" | "interrupted";

/**
 * One occurrence of a trigger, from the agent's records. Times are milliseconds
 * since the epoch.
 */
export interface Occurrence {
  id: string;
  /** When it was due, and when it fired, which is later when the agent was down at the time. A run by hand is due when it fires. */
  due: number;
  firedAt: number;
  byHand: boolean;
  /** How it ended, or null while it is still going. */
  ended: OccurrenceEnding | null;
  /** Why it failed or was skipped, when it says. */
  reason: string | null;
}

/** A standing trigger, as the agent's records have it. */
export interface TriggerSummary {
  /** The trigger's name, which is its file's name. */
  name: string;
  schedule: TriggerSchedule;
  /** The thread its occurrences go to, or null when they go to a session of its own. */
  thread: string | null;
  /** Whether it is on. `enabled: false` in its file turns it off. */
  on: boolean;
  /** When its next occurrence is due, or null when it is off. */
  next: number | null;
  /** Its latest occurrence, or null before the first. */
  last: Occurrence | null;
  /**
   * For a trigger with a check that has run: when it last ran, in milliseconds
   * since the epoch, and how many checks in a row, that one included, have found
   * no news since the last occurrence was made, which is 0 when the last check
   * made one. Null for a trigger that has no check, or has not run it yet.
   */
  lastCheck: { at: number; quiet: number } | null;
}

/** A trigger with its definition and its most recent occurrences. */
export interface TriggerDetail extends TriggerSummary {
  /** What a running occurrence is told to do: the body of its file. */
  prompt: string;
  /** Whether a due occurrence is skipped while the last one is still going (`skip`), or handed over behind it (`allow`). */
  overlap: "skip" | "allow";
  /** Its check, or null when every occurrence wakes the agent. */
  check: Check | null;
  /** The address of the session of its own that its occurrences go to, if they go there, whether or not it has been made yet. */
  session: string | null;
  /** The latest occurrences, newest first. */
  occurrences: Occurrence[];
}

/**
 * How an accepted input ended. `answered` is the agent's final answer, which
 * may be empty. `cancelled` means someone stopped the work. `unanswered` is
 * anything else that left the input without an answer: `reason` is a short
 * code such as `model_error`, and `detail` says more when the agent knows more.
 */
export type Settlement =
  | { status: "answered"; text: string }
  | { status: "cancelled" }
  | { status: "unanswered"; reason: string; detail: string | null };

/**
 * What an agent found in its home when it read it again, after `reload`: how
 * much of each kind it now gives its sessions, the model they follow, and the
 * files it could not use.
 */
export interface Reloaded {
  /** Whether `SOUL.md` has instructions in it. */
  soul: boolean;
  /** How many Markdown files of `context/` it gives its sessions. */
  files: number;
  /** How many skills it tells its sessions about. */
  skills: number;
  /** How many triggers it has now, on or off, counting one whose file it could not use but still has a last valid definition of. */
  triggers: number;
  /** The model the home names, which its sessions follow now: the one `agent.json` names, or else the folder's default. */
  model: { provider: string; id: string };
  /** The model they followed until this reload, when it found the home naming another; null when it is the same one. */
  changedFrom: { provider: string; id: string } | null;
  /**
   * Files it did not use, each with why. Everything else was read. The file
   * that names the model is among them when that model can't be used, and then
   * the sessions keep the model they had.
   */
  leftOut: { file: string; reason: string }[];
}
