import type { TestContext } from "node:test";
import type { ChatConnection, Member } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import { type RunningChat, startChat } from "../index.ts";
import { stopAfter, tempDir } from "./cleanup.ts";

/**
 * Give this test a runtime directory of its own, so the sockets of its servers
 * never meet another test's, or anything else on the machine. Its name is short
 * because a socket's whole path must fit in about a hundred bytes.
 */
export function useRuntimeDir(t: TestContext): string {
  const directory = tempDir(t, "rt");
  const saved = process.env.SHRIMPY_RUNTIME_DIR;
  process.env.SHRIMPY_RUNTIME_DIR = directory;
  stopAfter(t, () => {
    if (saved === undefined) delete process.env.SHRIMPY_RUNTIME_DIR;
    else process.env.SHRIMPY_RUNTIME_DIR = saved;
  });
  return directory;
}

export interface TestChat {
  readonly chat: RunningChat;
  readonly dataDir: string;
  /** A connection that has not said who it is. */
  connect(): Promise<ChatConnection>;
  /** A connection that has said it is `member`. */
  join(member: Member): Promise<ChatConnection>;
}

/**
 * A chat server in this process, with a data directory and a runtime directory
 * of its own. It stops, with the connections made through it, when the test ends.
 */
export async function startTestChat(t: TestContext): Promise<TestChat> {
  useRuntimeDir(t);
  const dataDir = tempDir(t, "chat-data");
  const chat = await startChat({ dataDir });
  stopAfter(t, () => chat.close());
  const connect = async (): Promise<ChatConnection> => {
    const connection = await connectLocal(chat.endpoint);
    stopAfter(t, () => connection.close());
    return connection;
  };
  return {
    chat,
    dataDir,
    connect,
    async join(member) {
      const connection = await connect();
      await connection.chat.identify(member);
      return connection;
    },
  };
}
