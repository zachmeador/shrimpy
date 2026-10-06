import type { Channel, ChatClient, Member, Thread } from "../../contracts/chat/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";
import type { Named, Place } from "../inputs/index.ts";
import type { Taken } from "./wake.ts";

/** How many of the others in a room are named to the model. The rest are counted. */
const NAMED = 12;

/** What telling where an event's thread is needs, apart from the event. */
export interface PlaceContext {
  chat: ChatClient;
  self: Member;
  signal: AbortSignal;
  /** Told when chat refused to say, and the event goes ahead with the place its session has. */
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
 * in its session's record and tells the model. Chat is asked afresh each time, for
 * the event's channel and for that channel's threads, so that a name that
 * changed, or a member who joined, is told at once. An event whose channel or
 * thread chat does not list, or that chat refuses to answer for, goes ahead with
 * no place of its own, and carries the one its session has.
 */
export async function inPlace(context: PlaceContext, taken: Taken): Promise<Taken> {
  const { chat, self, signal } = context;
  let place: Place | undefined;
  try {
    const channel = (await chat.channels(signal)).find((each) => each.id === taken.channelId);
    const threads = channel === undefined ? [] : await chat.threads(channel.id, signal);
    const thread = threads.find((each) => each.id === taken.threadId);
    place = channel === undefined || thread === undefined ? undefined : describePlace(self, channel, thread);
  } catch (error) {
    // Chat says no for good: the event is taken up without a place of its own, and a later one may learn it.
    if (!isRefusal(error)) throw error;
    context.onError(new Error(`The agent could not ask chat where thread ${taken.threadId} is, so it goes on with the place its session has: ${error.message}`));
    return taken;
  }
  return place === undefined ? taken : { ...taken, place };
}
