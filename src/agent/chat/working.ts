import type { ChatLink, LiveChat } from "../links/index.ts";
import type { Working } from "../turns/index.ts";

/**
 * Keep chat told which threads the agent is working in, as its sessions say:
 * a thread is marked from the moment an event in it is taken up until the
 * receipt on its last event is left. A mark lasts as long as the connection
 * that made it, so each new connection is told the whole list again, and while
 * there is none nothing is sent. Calls go out one at a time. Returns what stops it.
 */
export function markWorking(link: ChatLink, working: Working, onError: (error: Error) => void): () => void {
  /** The threads marked on the connection that is up. */
  let marked: { live: LiveChat; threads: Set<string> } | undefined;
  let syncing: Promise<void> = Promise.resolve();

  async function mark(live: LiveChat, threadId: string, on: boolean): Promise<boolean> {
    try {
      await live.chat.setWorking(threadId, on, live.lost);
      return true;
    } catch (error) {
      if (!live.lost.aborted) {
        const saying = on ? "as one the agent is working in" : "as one the agent has finished in";
        onError(new Error(`Chat would not mark the thread ${threadId} ${saying}: ${asError(error).message}`, { cause: error }));
      }
      return false;
    }
  }

  async function sync(): Promise<void> {
    const live = link.current();
    if (live === undefined) return;
    if (marked?.live !== live) marked = { live, threads: new Set() };
    const here = marked.threads;
    let wanted: ReadonlySet<string>;
    try {
      wanted = await working.threads();
    } catch (error) {
      onError(asError(error));
      return;
    }
    for (const threadId of wanted) {
      if (!here.has(threadId) && (await mark(live, threadId, true))) here.add(threadId);
    }
    for (const threadId of [...here]) {
      if (!wanted.has(threadId) && (await mark(live, threadId, false))) here.delete(threadId);
    }
  }

  const sooner = (): void => {
    syncing = syncing.then(sync);
  };
  const stops = [link.onUp(sooner), working.onChange(sooner)];
  return () => {
    for (const stop of stops) stop();
  };
}

const asError = (error: unknown): Error => (error instanceof Error ? error : new Error(String(error)));
