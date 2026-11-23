import { pauseAfter } from "../../lib/retry/index.ts";
import type { Outstanding, TurnOutcome } from "../inputs/index.ts";

/** What one try at telling came to: told, or "later" when chat was away or the try failed. */
export type Told = "told" | "later";

/** What the task that follows an input asks of whoever tells the input's source how its turn ended. */
export interface Delivery {
  /**
   * Try once to tell the source of an input how its turn ended. The task tries
   * again after a pause when this comes to "later", and again after a crash, so
   * whoever tells makes every step safe to do twice. It ends with a rejection only
   * when `signal` aborts.
   */
  tell(outstanding: Outstanding, outcome: TurnOutcome, signal: AbortSignal): Promise<Told>;
}

/** The longest a task that waits for chat sleeps between tries. */
const LONGEST_CHAT_PAUSE_MS = 5_000;

/**
 * How long a task sleeps after `tries` tries at chat that came to "later",
 * counting from 0: a quarter of a second, doubling up to five seconds. It sleeps
 * as one of the engine's sleeping tasks, which holds nothing meanwhile, so a crash
 * while chat is away cuts nothing off, and the engine's limit on crashes never
 * counts the wait.
 */
export const chatPause = (tries: number): number => pauseAfter(tries, { maxMs: LONGEST_CHAT_PAUSE_MS });
