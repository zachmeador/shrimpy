import type { Context } from "@earendil-works/chord/context";
import type { DocumentReader } from "@earendil-works/pi-durable";
import { SessionsDoc } from "./documents.durable.ts";

/** The thread a session is behind, and that thread's channel. */
export interface SessionThread {
  threadId: string;
  channelId: string;
}

/** The thread the session `conversationId` is behind, or undefined if not found. */
export async function threadOfSession(
  read: DocumentReader,
  conversationId: number,
  context: Context,
): Promise<SessionThread | undefined> {
  const sessions = (await read.snapshot(SessionsDoc, context))?.sessions ?? {};
  for (const [threadId, record] of Object.entries(sessions)) {
    if (record.conversationId === conversationId) return { threadId, channelId: record.channelId };
  }
  return undefined;
}
