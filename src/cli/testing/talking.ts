import type { TestContext } from "node:test";
import { type Entered, enterAsPerson } from "../../contracts/chat/testing/index.ts";
import { startTestGateway, type TestGateway } from "../../contracts/gateway/testing/index.ts";
import { tempDir } from "../../lib/testing/index.ts";
import { type ServedChat, serveChat } from "./process.ts";
import { untilRegistered } from "./registered.ts";

export interface Talking {
  readonly gateway: TestGateway;
  readonly chat: ServedChat;
  /** A connection to the chat server, by its name through the gateway, as the person who runs the commands, closed when the test ends. */
  you(): Promise<Entered>;
}

/**
 * A gateway and a chat server, each as the process people start, with the chat
 * server registered. They use the test's runtime directory, and stop when the
 * test ends. What answers in chat is up to the test, which can start a scripted
 * agent on them.
 */
export async function startTalking(t: TestContext): Promise<Talking> {
  const gateway = await startTestGateway(t);
  const chat = await serveChat(t, tempDir(t, "chat-data"));
  await untilRegistered("chat", "chat");
  return { gateway, chat, you: () => enterAsPerson(t) };
}
