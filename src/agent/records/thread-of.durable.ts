import type { Context } from "@earendil-works/chord";
import type { DocumentReader } from "@earendil-works/pi-durable";
import { type SessionRecord, SessionsDoc, triggerSession } from "./documents.durable.ts";

/** The thread a session is behind, and that thread's channel. */
export interface SessionThread {
  threadId: string;
  channelId: string;
}

/** What a session is behind: a thread, or nothing but the trigger whose own session it is. */
export type SessionPlace = SessionThread | { trigger: string };

/** The address the agent's records keep the session at `place` under. */
export function addressOfPlace(place: SessionPlace): string {
  return "threadId" in place ? place.threadId : triggerSession(place.trigger);
}

/** The session `conversationId` is, by the agent's records: its address and its record. */
async function findSession(
  read: DocumentReader,
  conversationId: number,
  context: Context,
): Promise<{ address: string; record: SessionRecord } | undefined> {
  const sessions = (await read.snapshot(SessionsDoc, context))?.sessions ?? {};
  for (const [address, record] of Object.entries(sessions)) {
    if (record.conversationId === conversationId) return { address, record };
  }
  return undefined;
}

/**
 * Where the session `conversationId` is, or undefined for a conversation that
 * is no session of the agent's. Sessions are named by the engine's number for
 * them, which is what the engine tells a tool it runs in, and only this module
 * knows how that number maps to a session.
 */
export async function placeOfSession(
  read: DocumentReader,
  conversationId: number,
  context: Context,
): Promise<SessionPlace | undefined> {
  const found = await findSession(read, conversationId, context);
  if (found === undefined) return undefined;
  const { address, record } = found;
  return record.channelId === null ? { trigger: record.trigger } : { threadId: address, channelId: record.channelId };
}

/** The thread the session `conversationId` is behind, or undefined for a session that is behind none. */
export async function threadOfSession(
  read: DocumentReader,
  conversationId: number,
  context: Context,
): Promise<SessionThread | undefined> {
  const place = await placeOfSession(read, conversationId, context);
  return place !== undefined && "threadId" in place ? place : undefined;
}
