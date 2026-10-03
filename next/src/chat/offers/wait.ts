import type { Context } from "@earendil-works/chord";
import type { Store } from "../store/index.ts";

/**
 * Wait until a message is posted anywhere. The wait ends in a rejection if the
 * context is cancelled, which is how the server ends it when the caller gives
 * up or its connection drops. Either way it stops watching the store.
 */
export function nextMessage(store: Store, context: Context): Promise<void> {
  const signal = context.abortSignal;
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancellation(signal));
      return;
    }
    let finished = false;
    const finish = (): boolean => {
      if (finished) return false;
      finished = true;
      stopWatching();
      signal?.removeEventListener("abort", cancel);
      return true;
    };
    const stopWatching = store.subscribe((change) => {
      if (change.kind === "message" && finish()) resolve();
    });
    function cancel(): void {
      if (finish()) reject(cancellation(signal));
    }
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

function cancellation(signal: AbortSignal | undefined): Error {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new DOMException("The wait was cancelled", "AbortError");
}
