import type { Channel, ChatEvent, Member } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { Backlog, Snapshot } from "../inputs/index.ts";
import type { ChatCalls } from "../links/index.ts";
import { audienceOf } from "./audience.ts";
import { backlogOf, readUnseen } from "./backlog.ts";
import type { Taken } from "./wake.ts";

/** What taking an event up with what came before it needs, apart from the event. */
export interface UnseenContext {
  chat: ChatCalls;
  self: Member;
  /** Where the agent last looked in a thread, or undefined if it never has. */
  looked(threadId: string): Promise<number | undefined>;
  signal: AbortSignal;
  /** Told when what was said in the thread could not be read, and the event goes ahead without it. */
  onError(error: Error): void;
}

/**
 * What the model also needs of an event that wakes the agent: what was said in
 * the thread since the agent last looked, which comes before it, and in a room
 * who the event's message was for. Chat is asked while the agent is connected,
 * because the feed has just brought the event. An event in a channel chat does
 * not list comes back as it was: nothing is added.
 */
export async function withUnseen(context: UnseenContext, event: ChatEvent, taken: Taken): Promise<Taken> {
  const { chat, self, signal } = context;
  const channelOf = (): Channel | undefined => chat.channels().find((each) => each.id === taken.channelId);
  const channel = channelOf();
  if (channel === undefined) return taken;

  const { threadId } = taken;
  const snapshot = taken.event;
  const mentioned = event.kind === "posted" || event.kind === "edited" ? event.mentions : event.message.mentions;
  const told: Snapshot =
    channel.kind === "room" && (snapshot.kind === "posted" || snapshot.kind === "edited")
      ? { ...snapshot, to: audienceOf(self, event.message.author, mentioned, channel) }
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
    // A member added since the room was first looked at may be among who the messages were for.
    backlog = backlogOf(unseen, more, self, channelOf() ?? channel);
  } catch (error) {
    // Chat says no for good: the event is taken up without what came before it, and the agent can read the thread.
    if (!isRefusal(error)) throw error;
    context.onError(new Error(`The agent could not read what was said in thread ${threadId} before ${snapshot.id}: ${error.message}`));
    backlog = { messages: [], cut: 0 };
  }
  return { ...taken, event: told, backlog };
}
