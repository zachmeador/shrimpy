import type { TestContext } from "node:test";
import { enterAsPerson, type Speaking, startTestChat, type TestChat } from "../../contracts/chat/testing/index.ts";
import { startTestGateway, type TestGateway } from "../../contracts/gateway/testing/index.ts";
import { untilLinked } from "./linked.ts";

export interface Talking {
  readonly gateway: TestGateway;
  readonly chat: TestChat;
  /** You, linked to the gateway, as a member of chat, until the test ends. */
  you(): Promise<Speaking>;
}

/**
 * A gateway and a chat server, each as the process people start, with the chat
 * server linked. They use the test's runtime directory, and stop when the test
 * ends. What answers in chat is up to the test, which can start a scripted
 * agent on them.
 */
export async function startTalking(t: TestContext): Promise<Talking> {
  const gateway = await startTestGateway(t);
  const chat = await startTestChat(t);
  await untilLinked("chat", "chat");
  let you: Promise<Speaking> | undefined;
  return { gateway, chat, you: () => (you ??= enterAsPerson(t)) };
}
