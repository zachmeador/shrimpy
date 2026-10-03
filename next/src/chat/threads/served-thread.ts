import { type ReplicatedState, replicatedState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { ThreadView } from "../../contracts/chat/index.ts";
import type { ChatDeps } from "./deps.ts";
import { publishThreadView } from "./publish.ts";
import { readThreadView } from "./thread-view.ts";

/** A thread being served: the live view clients attach to, and the means to keep it current. */
export interface ServedThread {
  /** Readable here at any time; clients get the same state through `ThreadService`. */
  readonly state: ReplicatedState<ThreadView> & { readonly value: ThreadView };
  /**
   * Keep the view current while someone watches it. Call the result when that
   * watcher is done. A thread nobody watches follows nothing and costs nothing.
   */
  watch(): () => void;
  /** Stop following, for good. */
  close(): void;
}

export function serveThread(deps: ChatDeps, threadId: string): ServedThread {
  const state = replicatedState(readThreadView(deps, threadId));
  const refresh = (): void => {
    publishThreadView(state, readThreadView(deps, threadId), BACKGROUND_CONTEXT);
  };
  let watchers = 0;
  let unfollow: (() => void) | undefined;
  let closed = false;

  const follow = (): void => {
    // Changes that came while nobody watched are caught up first.
    refresh();
    const stopStore = deps.store.subscribe((change) => {
      if (change.threadId === threadId) refresh();
    });
    const stopMarks = deps.working.subscribe((changed) => {
      if (changed === threadId) refresh();
    });
    unfollow = () => {
      stopStore();
      stopMarks();
    };
  };

  const stopFollowing = (): void => {
    unfollow?.();
    unfollow = undefined;
  };

  return {
    state,
    watch() {
      if (closed) throw new Error(`Thread ${threadId} is no longer served`);
      if (watchers === 0) follow();
      watchers += 1;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        watchers -= 1;
        if (watchers === 0) stopFollowing();
      };
    },
    close() {
      closed = true;
      stopFollowing();
    },
  };
}
