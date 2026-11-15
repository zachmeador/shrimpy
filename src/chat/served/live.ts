import type { FollowAttach } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { diffRevisions } from "@earendil-works/chord/delta";
import type { JsonValue } from "@earendil-works/chord/json";

/**
 * What tells a live value that something it is worked out from may have
 * changed: given `changed` to call then, and the value as it stands, it
 * returns what stops it.
 */
export type Watch<T> = (changed: () => void, current: () => T) => () => void;

/**
 * What `self.follow` takes for a value `read` works out: once `ready` has
 * resolved it works the value out, and again whenever `watch` says something
 * may have changed, and tells its followers only what did. `read` and `watch`
 * run in this process, beside the store, so nothing polls.
 */
export function live<T extends JsonValue>(
  read: () => T,
  watch: Watch<T>,
  ready: (signal: AbortSignal | undefined) => Promise<void>,
): FollowAttach<T> {
  return async (observer, context) => {
    await ready(context.abortSignal);
    let current = read();
    const stop = watch(
      () => {
        const next = read();
        const ops = diffRevisions(current, next);
        if (ops.length === 0) return;
        current = next;
        observer.advance({ kind: "value", value: next, ops, retired: false }, BACKGROUND_CONTEXT);
      },
      () => current,
    );
    return { value: current, detach: stop };
  };
}
