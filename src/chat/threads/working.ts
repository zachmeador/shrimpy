import type { Thread, Working } from "../../contracts/chat/index.ts";
import { compare } from "../../lib/files/index.ts";
import { createListeners } from "../../lib/listeners/index.ts";
import type { ThreadRecord } from "../store/index.ts";

interface Mark {
  since: number;
  /** The holders that marked the member and have not cleared it or ended. */
  holders: Set<string>;
}

/**
 * Who is working in which thread, kept in memory for as long as the holders
 * that said so. A holder is a caller's hold of `Chat`, by a key its owner
 * chooses. It is never stored: when the chat server restarts nobody holds
 * anything, so nobody is working.
 */
export interface WorkingMarks {
  /**
   * Mark a member as working in a thread, or clear that, on behalf of one
   * holder. A member stays marked until every holder that marked it has cleared
   * it or ended, and keeps the `since` of its first mark meanwhile.
   */
  set(holder: string, memberId: string, threadId: string, working: boolean, now: number): void;
  /** Drop every mark a holder made. */
  end(holder: string): void;
  /** Who is working in a thread, the longest first. */
  list(threadId: string): Working[];
  /** Be told a thread's ID whenever the members working in it change. */
  subscribe(listener: (threadId: string) => void): () => void;
}

export interface WorkingMarksOptions {
  /** Where a failing watcher is reported. */
  onError: (error: Error) => void;
}

export function createWorkingMarks(options: WorkingMarksOptions): WorkingMarks {
  const byThread = new Map<string, Map<string, Mark>>();
  const watchers = createListeners<string>(options.onError);
  const changed = (threadId: string): void => watchers.notify(threadId);

  /** Take one holder off a member's mark. True when that cleared the mark. */
  const release = (threadId: string, memberId: string, holder: string): boolean => {
    const marks = byThread.get(threadId);
    const mark = marks?.get(memberId);
    if (marks === undefined || mark === undefined) return false;
    if (!mark.holders.delete(holder) || mark.holders.size > 0) return false;
    marks.delete(memberId);
    if (marks.size === 0) byThread.delete(threadId);
    return true;
  };

  return {
    set(holder, memberId, threadId, working, now) {
      if (!working) {
        if (release(threadId, memberId, holder)) changed(threadId);
        return;
      }
      const marks = byThread.get(threadId) ?? new Map<string, Mark>();
      byThread.set(threadId, marks);
      const mark = marks.get(memberId);
      if (mark === undefined) {
        marks.set(memberId, { since: now, holders: new Set([holder]) });
        changed(threadId);
      } else {
        mark.holders.add(holder);
      }
    },
    end(holder) {
      const cleared: string[] = [];
      for (const [threadId, marks] of [...byThread]) {
        for (const memberId of [...marks.keys()]) {
          if (release(threadId, memberId, holder)) cleared.push(threadId);
        }
      }
      for (const threadId of cleared) changed(threadId);
    },
    list(threadId) {
      const marks = byThread.get(threadId) ?? new Map<string, Mark>();
      return [...marks]
        .map(([memberId, mark]) => ({ memberId, since: mark.since }))
        .sort((a, b) => a.since - b.since || compare(a.memberId, b.memberId));
    },
    subscribe: (listener) => watchers.add(listener),
  };
}

/** A stored thread, with the members working in it now. */
export function withWorking(record: ThreadRecord, marks: WorkingMarks): Thread {
  return { ...record, working: marks.list(record.id) };
}
