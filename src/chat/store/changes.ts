/**
 * Something that became visible when a transaction committed. Watchers re-read
 * what they care about; the change only says where to look.
 */
export interface Change {
  /** An event was added to the log, or something about the thread itself changed. */
  kind: "event" | "thread";
  threadId: string;
}

export type ReportChange = (change: Change) => void;
