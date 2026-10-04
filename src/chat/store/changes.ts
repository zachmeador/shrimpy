/**
 * Something that became visible when a transaction committed. Watchers re-read
 * what they care about; the change only says where to look.
 */
export interface Change {
  /** A message arrived, or something about the thread itself changed. */
  kind: "message" | "thread";
  threadId: string;
}

export type ReportChange = (change: Change) => void;
