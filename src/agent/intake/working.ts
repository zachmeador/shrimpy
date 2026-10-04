import type { ChatLink } from "../links/index.ts";

/** Who the agent tells chat it is working for. */
export interface WorkingMarks {
  /** One more message is being worked on in the thread. */
  add(threadId: string): void;
  /** One of them is done. When the last one is, the thread is no longer marked. */
  remove(threadId: string): void;
}

/**
 * Keep chat told which threads the agent is working in, from picking a message
 * up until its receipt is left. A mark lasts as long as the connection that
 * made it, so each new connection is told again, and while there is none
 * nothing is sent. Calls go out in the order they were asked for.
 */
export function workingMarks(link: ChatLink, onError: (error: Error) => void): WorkingMarks {
  const counts = new Map<string, number>();
  let sending: Promise<void> = Promise.resolve();

  const tell = (threadId: string, working: boolean): void => {
    sending = sending.then(async () => {
      const live = link.current();
      if (live === undefined) return;
      try {
        await live.chat.setWorking(threadId, working, live.lost);
      } catch (error) {
        if (!live.lost.aborted) onError(error instanceof Error ? error : new Error(String(error)));
      }
    });
  };

  link.onUp(() => {
    for (const threadId of counts.keys()) tell(threadId, true);
  });

  return {
    add(threadId) {
      const count = counts.get(threadId) ?? 0;
      counts.set(threadId, count + 1);
      if (count === 0) tell(threadId, true);
    },
    remove(threadId) {
      const count = counts.get(threadId);
      if (count === undefined) return;
      if (count > 1) {
        counts.set(threadId, count - 1);
        return;
      }
      counts.delete(threadId);
      tell(threadId, false);
    },
  };
}
