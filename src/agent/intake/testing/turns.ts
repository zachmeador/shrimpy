import type { Outstanding, Snapshot, Turn, TurnOutcome, Turns } from "../index.ts";

type Method = "cursor" | "setCursor" | "record" | "start" | "withdraw" | "outstanding" | "settle";

/**
 * The agent's sessions and records as a test scripts them: nothing is stored
 * anywhere, and a turn ends when the test says so. It keeps what a restarted
 * agent would find, so one of these can be handed to a second intake.
 */
export interface ScriptedTurns extends Turns {
  /** The text each message was handed to its session as, by message ID. */
  readonly handed: ReadonlyMap<string, string>;
  /** What was settled, in the order it was. */
  readonly settled: { messageId: string; outcome: TurnOutcome }[];
  /** The calls made, in order, each as the method, and what it was about when it was about something. */
  readonly calls: string[];
  /** Make the next message recorded in a thread take these earlier ones along. */
  takeAlong(threadId: string, earlier: Snapshot[]): void;
  /** End the turns of these messages with `outcome`, as their session would. */
  end(outcome: TurnOutcome, ...messageIds: string[]): void;
  /** Make the next `times` calls of `method` fail with `error`. */
  fail(method: Method, error: Error, times?: number): void;
}

interface Ending {
  ended: Promise<void>;
  finish(outcome: TurnOutcome): void;
  outcome?: TurnOutcome;
}

export function scriptedTurns(): ScriptedTurns {
  let cursor: number | undefined;
  const outbox = new Map<string, Outstanding>();
  const delivered = new Set<string>();
  const endings = new Map<string, Ending>();
  const along = new Map<string, Snapshot[]>();
  const failures = new Map<Method, { error: Error; times: number }>();
  const handed = new Map<string, string>();
  const settled: ScriptedTurns["settled"] = [];
  const calls: string[] = [];

  const endingOf = (id: string): Ending => {
    const existing = endings.get(id);
    if (existing !== undefined) return existing;
    let resolve: () => void = () => undefined;
    const ended = new Promise<void>((done) => {
      resolve = done;
    });
    const made: Ending = {
      ended,
      finish(outcome) {
        made.outcome ??= outcome;
        resolve();
      },
    };
    endings.set(id, made);
    return made;
  };

  const call = (method: Method, about?: string): void => {
    calls.push(about === undefined ? method : `${method} ${about}`);
    const failure = failures.get(method);
    if (failure === undefined || failure.times === 0) return;
    failure.times -= 1;
    throw failure.error;
  };

  return {
    handed,
    settled,
    calls,
    async cursor() {
      call("cursor");
      return cursor;
    },
    async setCursor(seq) {
      call("setCursor", String(seq));
      cursor = seq;
    },
    async record(draft) {
      call("record", draft.message.id);
      const existing = outbox.get(draft.message.id);
      if (existing !== undefined) return existing;
      if (delivered.has(draft.message.id)) return undefined;
      const earlier = along.get(draft.threadId) ?? [];
      along.delete(draft.threadId);
      const outstanding: Outstanding = { ...draft, earlier };
      outbox.set(draft.message.id, outstanding);
      return outstanding;
    },
    async start(outstanding, text) {
      const id = outstanding.message.id;
      call("start", id);
      handed.set(id, text);
      const ending = endingOf(id);
      const turn: Turn = {
        ended(signal) {
          return new Promise<void>((resolve, reject) => {
            if (signal.aborted) return reject(new Error("The wait was cancelled"));
            signal.addEventListener("abort", () => reject(new Error("The wait was cancelled")), { once: true });
            void ending.ended.then(resolve);
          });
        },
        async outcome() {
          if (ending.outcome === undefined) throw new Error(`The turn for ${id} has not ended`);
          return ending.outcome;
        },
      };
      return turn;
    },
    async withdraw(outstanding) {
      call("withdraw", outstanding.message.id);
      // A turn that has already ended keeps the way it ended.
      endingOf(outstanding.message.id).finish({ kind: "skipped" });
    },
    async outstanding() {
      call("outstanding");
      return [...outbox.values()].sort((a, b) => a.message.seq - b.message.seq);
    },
    async settle(outstanding, outcome) {
      call("settle", outstanding.message.id);
      outbox.delete(outstanding.message.id);
      delivered.add(outstanding.message.id);
      settled.push({ messageId: outstanding.message.id, outcome });
    },
    takeAlong(threadId, earlier) {
      along.set(threadId, earlier);
    },
    end(outcome, ...messageIds) {
      for (const id of messageIds) endingOf(id).finish(outcome);
    },
    fail(method, error, times = 1) {
      failures.set(method, { error, times });
    },
  };
}
