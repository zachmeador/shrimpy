import type { Channel, ChatClient, Member, Thread } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { Named, Place } from "../inputs/index.ts";
import type { Channels } from "./channels.ts";
import type { Taken } from "./wake.ts";

/** How many of the others in a room are named to the model. The rest are counted. */
const NAMED = 12;

/** What telling where an event's thread is needs, apart from the event. */
export interface PlaceContext {
  chat: ChatClient;
  self: Member;
  channels: Channels;
  signal: AbortSignal;
  /** Told when chat refused the threads of a channel, and the event goes ahead without its place. */
  onError(error: Error): void;
}

const named = ({ name, kind }: Member): Named => ({ name, kind });

/**
 * Where `thread` is, as chat says it: the agent's DM with the one other member,
 * or the room and who else is in it, by name, and which thread it is. Nothing for
 * a DM that has no one but the agent in it.
 */
export function describePlace(self: Member, channel: Channel, thread: Thread): Place | undefined {
  const there = { main: thread.main, name: thread.name };
  const others = channel.members.filter((member) => member.id !== self.id).sort((a, b) => a.name.localeCompare(b.name));
  if (channel.kind === "dm") {
    const [other] = others;
    return other === undefined ? undefined : { kind: "dm", with: named(other), thread: there };
  }
  const more = others.length - NAMED;
  return { kind: "room", room: channel.name, others: others.slice(0, NAMED).map(named), ...(more > 0 ? { more } : {}), thread: there };
}

/**
 * An event that wakes the agent, with where its thread is, which the agent keeps
 * in its session's record and tells the model. Chat is asked while the agent is
 * connected, once for each channel and for its threads, and what it says is
 * remembered. An event whose channel or thread chat does not list, or whose
 * threads it refuses, goes ahead without a place.
 */
export async function inPlace(context: PlaceContext, taken: Taken): Promise<Taken> {
  const { chat, self, channels, signal } = context;
  const channel = await channels.find(chat, taken.channelId, signal);
  if (channel === undefined) return taken;
  let thread: Thread | undefined;
  try {
    thread = await channels.thread(chat, channel.id, taken.threadId, signal);
  } catch (error) {
    // Chat says no for good: the event is taken up without its place, and a later one may learn it.
    if (!isRefusal(error)) throw error;
    context.onError(new Error(`The agent could not ask chat for the threads of channel ${channel.id}, so it did not learn where thread ${taken.threadId} is: ${error.message}`));
    return taken;
  }
  const place = thread === undefined ? undefined : describePlace(self, channel, thread);
  return place === undefined ? taken : { ...taken, place };
}
