import type { ThreadView } from "../../contracts/chat/index.ts";
import type { ChatDeps } from "./deps.ts";
import { withWorking } from "./working.ts";

/** Messages in a thread view. Older ones are counted in `earlier` and read with `read`. */
export const VIEW_MESSAGES = 200;

/** A thread as clients show it: its newest messages, and how many come before them. */
export function readThreadView(deps: ChatDeps, threadId: string): ThreadView {
  return deps.store.transaction((tx) => {
    const record = tx.thread(threadId);
    if (record === undefined) throw new Error(`Unknown thread ${threadId}`);
    const messages = tx.messagesIn(threadId, null, VIEW_MESSAGES);
    return {
      thread: withWorking(record, deps.working),
      messages,
      earlier: tx.messageCount(threadId) - messages.length,
    };
  });
}
