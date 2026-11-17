import type { TestContext } from "node:test";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { openStore, type Store } from "../store/index.ts";

/** Where a test's store and working marks report a watcher that failed: on standard error, as the chat server does. */
export const reportToStderr = (error: Error): void => console.error("[chat]", error);

/** A store in a fresh data directory. It is closed, and the directory removed, when the test ends. */
export function openTestStore(t: TestContext): { store: Store; dataDir: string } {
  const dataDir = tempDir(t, "chat-store");
  const store = openStore(dataDir, { onError: reportToStderr });
  stopAfter(t, () => store.close());
  return { store, dataDir };
}
