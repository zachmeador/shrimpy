import type { TestContext } from "node:test";
import type { ChatConnection, Member } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { type RunningChat, startChat } from "../index.ts";

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
