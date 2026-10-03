/**
 * The chat server program: one process that keeps channels, threads and
 * messages in its own store and serves the chat API for everyone on this
 * machine. Other programs reach chat only through `contracts/chat`; they never
 * import this program's modules.
 */
import type { ChatEndpoint } from "../contracts/chat/index.ts";
import { openStore } from "./store/index.ts";
import { startServer } from "./server.ts";
import { type ChatDeps, createWorkingMarks } from "./threads/index.ts";

export { ChatRunningError } from "./lock.ts";

export interface ChatOptions {
  /** Where the chat server keeps its store and its endpoint. */
  dataDir: string;
}

export interface RunningChat {
  readonly endpoint: ChatEndpoint;
  close(): Promise<void>;
}

/**
 * Take the data directory, then start serving it. The store's lock comes
 * first, then the socket's, so a second chat server on this machine is
 * refused with `StoreOwnedError` or `ChatRunningError`.
 */
export async function startChat(options: ChatOptions): Promise<RunningChat> {
  const onError = (error: Error): void => console.error("[chat]", error.message);
  const store = openStore(options.dataDir, { onError });
  try {
    const deps: ChatDeps = {
      store,
      working: createWorkingMarks({ onError }),
      now: () => Date.now(),
    };
    const server = await startServer(deps, options.dataDir, onError);
    return {
      endpoint: server.endpoint,
      async close() {
        try {
          await server.close();
        } finally {
          store.close();
        }
      },
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
