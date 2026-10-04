import { userInfo } from "node:os";
import type { TestContext } from "node:test";
import { type ChatConnection, personMember } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import { stopAfter, tempDir } from "../../lib/testing/index.ts";
import { type ServedChat, type ServedGateway, serveChat, serveGateway } from "./process.ts";
import { untilRegistered } from "./registered.ts";

export interface Talking {
  readonly gateway: ServedGateway;
  readonly chat: ServedChat;
  /** A connection to the chat server as the person who runs the commands, closed when the test ends. */
  you(): Promise<ChatConnection>;
}

/**
 * A gateway and a chat server, each as the process people start, with the chat
 * server registered. They use the test's runtime directory, and stop when the
 * test ends. What answers in chat is up to the test, which can start a scripted
 * agent on them.
 */
export async function startTalking(t: TestContext): Promise<Talking> {
  const gateway = await serveGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  await untilRegistered("chat", "chat");
  return {
    gateway,
    chat,
    async you() {
      const connection = await connectLocal(chat.listening);
      stopAfter(t, () => connection.close());
      await connection.chat.identify(personMember(userInfo().username));
      return connection;
    },
  };
}
