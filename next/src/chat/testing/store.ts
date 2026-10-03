import type { TestContext } from "node:test";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { openStore, type Store, type StoreOptions } from "../store/index.ts";

/** A store in a fresh data directory. It is closed, and the directory removed, when the test ends. */
export function openTestStore(
  t: TestContext,
  options?: StoreOptions,
): { store: Store; dataDir: string } {
  const dataDir = tempDir(t, "chat-store");
  const store = openStore(dataDir, options);
  stopAfter(t, () => store.close());
  return { store, dataDir };
}
