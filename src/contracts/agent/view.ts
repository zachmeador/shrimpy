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
 * made and no model is called. The agent keeps it in its records, so it is a type
 * alias, which TypeScript lets stand for JSON.
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
  /** What news does: `wake` the agent with the trigger's prompt and the output, which it reads as data and not as instructions. */
  then: "wake";
  /** How long the check may run before it is stopped and counts as failed: a delay such as `30s` or `2m`, at most `10m`. */
  timeout: string;
};

/**
 * How an occurrence ended. A skipped occurrence never ran: the last one was still
 * going, or there was nowhere to send it. A quiet one ran its check, which found
 * no news, so no turn was made. An interrupted one was running its check when the
 * agent ended, and the check was not run again for it.
 */
export type OccurrenceEnding = "answered" | "silent" | "failed" | "stopped" | "skipped" | "quiet" | "interrupted";

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
 * much of each kind it now gives its sessions, and the files it could not use.
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
  /** Files it did not use, each with why. Everything else was read. */
  leftOut: { file: string; reason: string }[];
}
