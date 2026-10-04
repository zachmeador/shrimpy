import type { Context } from "@earendil-works/chord";
import type { DocumentReader } from "@earendil-works/pi-durable";
import { ThreadsDoc } from "./documents.ts";

/** The thread a session is behind, and that thread's channel. */
export interface SessionThread {
  threadId: string;
  channelId: string;
}

/**
 * The thread the session `conversationId` is behind, or undefined for a session
 * that is behind none. Sessions are named by the engine's number for them, which
 * is what the engine tells a tool it runs in, and only this module knows how that
 * number maps to a thread.
 */
export async function threadOfSession(
  read: DocumentReader,
  conversationId: number,
  context: Context,
): Promise<SessionThread | undefined> {
  const sessions = (await read.snapshot(ThreadsDoc, context))?.sessions ?? {};
  for (const [threadId, session] of Object.entries(sessions)) {
    if (session.conversationId === conversationId) return { threadId, channelId: session.channelId };
  }
  return undefined;
}
