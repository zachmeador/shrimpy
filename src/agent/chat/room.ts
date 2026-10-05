import type { ChatClient, ChatEvent, Member } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { Backlog, Snapshot } from "../inputs/index.ts";
import { audienceOf } from "./audience.ts";
import { backlogOf, readUnseen } from "./backlog.ts";
import type { Channels } from "./channels.ts";
import type { Taken } from "./wake.ts";

/** What taking an event up in a room needs, apart from the event. */
export interface RoomContext {
  chat: ChatClient;
  self: Member;
  channels: Channels;
  /** Where the agent last looked in a thread, or undefined if it never has. */
  looked(threadId: string): Promise<number | undefined>;
  signal: AbortSignal;
  /** Told when what was said in the thread could not be read, and the event goes ahead without it. */
  onError(error: Error): void;
}

/**
 * What the model also needs of an event that wakes the agent in a room: who the
 * event's message was for, and what was said in the thread since the agent last
 * looked, which comes before it. Chat is asked while the agent is connected,
 * because the feed has just brought the event. An event in a DM comes back as it
 * was: nothing is added.
 */
export async function inRoom(context: RoomContext, event: ChatEvent, taken: Taken): Promise<Taken> {
  const { chat, self, channels, signal } = context;
  const room = await channels.find(chat, taken.channelId, signal, event.message.mentions);
  if (room === undefined || room.kind !== "room") return taken;

  const { threadId } = taken;
  const snapshot = taken.event;
  const told: Snapshot =
    snapshot.kind === "posted" || snapshot.kind === "edited"
      ? { ...snapshot, to: audienceOf(self, event.message.author, event.message.mentions, room) }
      : snapshot;

  let backlog: Backlog;
  try {
    const { unseen, more } = await readUnseen({
      chat,
      self,
      threadId,
      before: snapshot.seq,
      since: await context.looked(threadId),
      except: event.message.id,
      signal,
    });
    // A member added since the room was last read may be among who the messages were for.
    const there = await channels.find(chat, taken.channelId, signal, unseen.flatMap((message) => message.mentions));
    backlog = backlogOf(unseen, more, self, there ?? room);
  } catch (error) {
    // Chat says no for good: the event is taken up without what came before it, and the agent can read the thread.
    if (!isRefusal(error)) throw error;
    context.onError(new Error(`The agent could not read what was said in thread ${threadId} before ${snapshot.id}: ${error.message}`));
    backlog = { messages: [], cut: 0 };
  }
  return { ...taken, event: told, backlog };
}
