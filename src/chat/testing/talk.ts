import type { TestContext } from "node:test";
import type { ChatConnection, ChatEvent, Message, Thread } from "../../contracts/chat/index.ts";
import { startTestChat } from "./chat.ts";

/** The main thread of a channel. */
export async function mainThread(connection: ChatConnection, channelId: string): Promise<Thread> {
  const main = (await connection.chat.threads(channelId)).find((thread) => thread.main);
  if (main === undefined) throw new Error(`Channel ${channelId} has no main thread`);
  return main;
}

/**
 * A chat server with the person who runs the gateway, called zach here, and
 * Shrimpy, an agent, connected to it, and the main thread of the DM zach opened
 * with Shrimpy.
 */
export async function startDm(t: TestContext) {
  const chat = await startTestChat(t);
  const zach = await chat.person();
  const shrimpy = await chat.agent("Shrimpy");
  const dm = await zach.chat.openDm(shrimpy.me.id);
  const main = await mainThread(zach, dm.id);
  return { chat, zach, shrimpy, dm, main };
}

export const texts = (messages: { text: string }[]): string[] => messages.map((message) => message.text);

/** What the posts among some events said, in order. */
export const posted = (events: ChatEvent[]): string[] =>
  events.flatMap((event) => (event.kind === "posted" ? [event.text] : []));

/** The log as lines, each an event's kind and what it carries: "edited: new text", "reacted: 👍", "deleted". */
export const logOf = (events: ChatEvent[]): string[] =>
  events.map((event) => {
    const carried = "text" in event ? event.text : "emoji" in event ? event.emoji : "";
    return carried === "" ? event.kind : `${event.kind}: ${carried}`;
  });

/** Every message of a thread, oldest first, read a page at a time. */
export async function readAll(connection: ChatConnection, threadId: string): Promise<Message[]> {
  const all: Message[] = [];
  let before: number | null = null;
  while (true) {
    const page: Message[] = await connection.chat.read(threadId, before, 200);
    const oldest = page[0];
    if (oldest === undefined) return all;
    all.unshift(...page);
    before = oldest.seq;
  }
}
