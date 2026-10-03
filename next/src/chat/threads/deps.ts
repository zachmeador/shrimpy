import type { Store } from "../store/index.ts";
import type { WorkingMarks } from "./working.ts";

/** What the chat operations run against. The clock is a parameter so tests can control time. */
export interface ChatDeps {
  readonly store: Store;
  readonly working: WorkingMarks;
  readonly now: () => number;
}
