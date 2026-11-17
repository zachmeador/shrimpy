import type { TestContext } from "node:test";
import { type ChildProgram, type Restartable, startRestartable, tempDir, useRuntimeDir } from "../../../lib/testing/index.ts";
import { SHRIMPY_ENTRY } from "../../gateway/testing/index.ts";

/** The line the chat server prints when it begins listening. */
export interface ChatListening {
  event: string;
  dataDir: string;
  pid: number;
}

/** The real chat server, as the command starts it in a process of its own, which a test takes down and brings back. */
export interface TestChat extends Omit<Restartable<ChatListening>, "recover"> {
  /** Where its store is now. */
  readonly dataDir: string;
  /** Start it again, like a chat server that came back, on the same data unless `dataDir` says otherwise. */
  recover(options?: { dataDir?: string }): Promise<void>;
}

/**
 * The real chat server, started through the command in a process of its own,
 * in the test's runtime directory, with a data directory of its own unless the
 * test gives one. It links to the test's gateway whenever there is one. It is
 * killed when the test ends if it is still running.
 */
export async function startTestChat(t: TestContext, options: { dataDir?: string } = {}): Promise<TestChat> {
  useRuntimeDir(t);
  let dataDir = options.dataDir ?? tempDir(t, "chat-data");
  const serve = (): ChildProgram => ({ file: SHRIMPY_ENTRY, args: ["chat", "serve", dataDir] });
  const chat = await startRestartable<ChatListening>(t, "The chat server", serve());
  return {
    ...chat,
    get listening() {
      return chat.listening;
    },
    get dataDir() {
      return dataDir;
    },
    recover: (given = {}) =>
      chat.recover(() => {
        dataDir = given.dataDir ?? dataDir;
        return serve();
      }),
  };
}
