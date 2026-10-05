import type { Outstanding, TurnOutcome } from "../inputs/index.ts";

/** What the task that follows an input asks of whoever tells the input's source how its turn ended. */
export interface Delivery {
  /**
   * Tell the source of an input how its turn ended. The task does this again
   * after a crash, so whoever tells makes every step safe to do twice. It ends
   * with a rejection only when `signal` aborts.
   */
  tell(outstanding: Outstanding, outcome: TurnOutcome, signal: AbortSignal): Promise<void>;
}
