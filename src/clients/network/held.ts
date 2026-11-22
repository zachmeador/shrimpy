import type { RefState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";

/** What can be watched for changes: a held object's state, or one of its members. */
interface Watched {
  watch(context: typeof BACKGROUND_CONTEXT): Promise<{ start(listener: () => Promise<void>): void; stop(): Promise<unknown> }>;
}

/** A held object: its state, and the members that are followed. */
export interface Followed {
  readonly state: { readonly value: RefState } & Watched;
}

/**
 * Call `changed` whenever `held`'s state or any of `members` changes, once for
 * all the changes of one turn of the event loop, and once when each starts
 * being followed. A member of an object that has never had values is followed
 * from its first values on. Returns what stops following.
 */
export function follow(held: Followed, members: readonly Watched[], changed: () => void): () => void {
  let stopped = false;
  let scheduled = false;
  const stops: (() => void)[] = [];
  const tell = (): void => {
    if (stopped || scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!stopped) changed();
    });
  };
  for (const source of [held.state, ...members]) {
    source.watch(BACKGROUND_CONTEXT).then(
      (watch) => {
        if (stopped) return void watch.stop();
        stops.push(() => void watch.stop());
        watch.start(async () => tell());
        tell();
      },
      // A watch of an object that is let go of first never starts, and there is nothing to follow.
      () => undefined,
    );
  }
  return () => {
    stopped = true;
    for (const stop of stops.splice(0)) stop();
  };
}
