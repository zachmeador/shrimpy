import type { ChatConnection, Thread } from "../../contracts/chat/index.ts";

/** The main thread of a channel. */
export async function mainThread(connection: ChatConnection, channelId: string): Promise<Thread> {
  const main = (await connection.chat.threads(channelId)).find((thread) => thread.main);
  if (main === undefined) throw new Error(`Channel ${channelId} has no main thread`);
  return main;
}

export const texts = (messages: { text: string }[]): string[] => messages.map((message) => message.text);
