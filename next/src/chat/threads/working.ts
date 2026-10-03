import type { Thread, Working } from "../../contracts/chat/index.ts";
import { createListeners } from "../../lib/listeners/index.ts";
import type { ThreadRecord } from "../store/index.ts";

interface Mark {
  since: number;
  /** The connections that marked the member and have not cleared it or ended. */
  connections: Set<object>;
}

/**
 * Who is working in which thread, kept in memory for as long as the connections
 * that said so. It is never stored: when the chat server restarts nobody is
 * connected, so nobody is working.
 */
export interface WorkingMarks {
  /**
   * Mark a member as working in a thread, or clear that, on behalf of one
   * connection. A member stays marked until every connection that marked it has
   * cleared it or ended, and keeps the `since` of its first mark meanwhile.
   */
  set(connection: object, memberId: string, threadId: string, working: boolean, now: number): void;
  /** Drop every mark a connection made. */
  end(connection: object): void;
  /** Who is working in a thread, the longest first. */
  list(threadId: string): Working[];
  /** Be told a thread's ID whenever the members working in it change. */
  subscribe(listener: (threadId: string) => void): () => void;
}

export interface WorkingMarksOptions {
  /** Where a failing watcher is reported. */
  onError?: (error: Error) => void;
}

export function createWorkingMarks(options: WorkingMarksOptions = {}): WorkingMarks {
  const onError = options.onError ?? reportToStderr;
  const byThread = new Map<string, Map<string, Mark>>();
  const watchers = createListeners<string>(onError);
  const changed = (threadId: string): void => watchers.notify(threadId);

  /** Take one connection's hold off a member's mark. True when that cleared the mark. */
  const release = (threadId: string, memberId: string, connection: object): boolean => {
    const marks = byThread.get(threadId);
    const mark = marks?.get(memberId);
    if (marks === undefined || mark === undefined) return false;
    if (!mark.connections.delete(connection) || mark.connections.size > 0) return false;
    marks.delete(memberId);
    if (marks.size === 0) byThread.delete(threadId);
    return true;
  };

  return {
    set(connection, memberId, threadId, working, now) {
      if (!working) {
        if (release(threadId, memberId, connection)) changed(threadId);
        return;
      }
      const marks = byThread.get(threadId) ?? new Map<string, Mark>();
      byThread.set(threadId, marks);
      const mark = marks.get(memberId);
      if (mark === undefined) {
        marks.set(memberId, { since: now, connections: new Set([connection]) });
        changed(threadId);
      } else {
        mark.connections.add(connection);
      }
    },
    end(connection) {
      const cleared: string[] = [];
      for (const [threadId, marks] of [...byThread]) {
        for (const memberId of [...marks.keys()]) {
          if (release(threadId, memberId, connection)) cleared.push(threadId);
        }
      }
      for (const threadId of cleared) changed(threadId);
    },
    list(threadId) {
      const marks = byThread.get(threadId) ?? new Map<string, Mark>();
      return [...marks]
        .map(([memberId, mark]) => ({ memberId, since: mark.since }))
        .sort((a, b) => a.since - b.since || (a.memberId < b.memberId ? -1 : 1));
    },
    subscribe: (listener) => watchers.add(listener),
  };
}

/** A stored thread, with the members working in it now. */
export function withWorking(record: ThreadRecord, marks: WorkingMarks): Thread {
  return { ...record, working: marks.list(record.id) };
}

function reportToStderr(error: Error): void {
  console.error("[chat]", error);
}
