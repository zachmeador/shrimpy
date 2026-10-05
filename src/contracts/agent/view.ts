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
 * takes part in, and addresses it by the thread's ID. A session with no
 * thread, such as a helper's, comes later with an ID of its own.
 */
export interface SessionSummary {
  /** The thread the session is behind. It is also the session's address at the agent: `attach` takes it. */
  threadId: string;
  channelId: string;
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
  /** Files it did not use, each with why. Everything else was read. */
  leftOut: { file: string; reason: string }[];
}
