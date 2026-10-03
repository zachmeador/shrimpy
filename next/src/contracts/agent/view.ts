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

export interface SessionSummary {
  id: string;
  /** The session an agent always has. */
  main: boolean;
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
