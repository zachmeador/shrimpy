import type { Context } from "@earendil-works/chord";
import type { DocumentReader } from "@earendil-works/pi-durable";
import type { Channel, ChatClient, Member } from "../../../contracts/chat/index.ts";
import { threadOfSession } from "../../sessions/index.ts";
import * as words from "./words.ts";

/** A thread a tool means, and what the model calls it. */
export interface Place {
  threadId: string;
  /** "this thread", or "your DM with Zach". */
  label: string;
  /** Whether it is the thread the turn came from. */
  here: boolean;
}

/** A place that cannot be used, in words the model can act on. */
export interface Unusable {
  problem: string;
}

export interface Find {
  /** Which argument named the place, for the words that complain about it. */
  argument: words.PlaceArgument;
  /** What the model gave, if anything: `@name`. */
  value: string | undefined;
  /** The session the tool runs in, as the engine numbers it. */
  conversationId: number;
  read: DocumentReader;
  chat: ChatClient;
  self: Member;
  context: Context;
  signal: AbortSignal;
}

/**
 * The thread a tool means. With nothing given it is the thread the turn came
 * from; `@name` is the main thread of the agent's DM with that member, found
 * among the DMs the agent already has. Rooms come with the chat server's rooms.
 */
export async function placeOf(find: Find): Promise<Place | Unusable> {
  const { argument, value, self } = find;
  if (value === undefined) {
    const here = await threadOfSession(find.read, find.conversationId, find.context);
    if (here === undefined) return { problem: words.noThreadHere(argument) };
    return { threadId: here.threadId, label: words.THIS_THREAD, here: true };
  }

  const name = /^@(.+)$/s.exec(value.trim())?.[1]?.trim();
  if (name === undefined) return { problem: words.badPlace(argument) };
  const wanted = name.toLowerCase();
  if (wanted === self.id.toLowerCase() || wanted === self.name.toLowerCase()) {
    return { problem: words.yourself(name, argument) };
  }

  const channels = await find.chat.channels(find.signal);
  const matches = channels.flatMap((channel) => membersCalled(channel, self, wanted).map((member) => ({ channel, member })));
  const [match, ...others] = matches;
  if (match === undefined) return { problem: words.noDm(name, argument) };
  if (others.length > 0) return { problem: words.severalMembers(name, matches.map((each) => each.member.id)) };

  const label = words.dmWith(match.member.name);
  const main = (await find.chat.threads(match.channel.id, find.signal)).find((thread) => thread.main);
  if (main === undefined) return { problem: words.noMainThread(label) };
  return { threadId: main.id, label, here: false };
}

/** The other members of a DM whose name or ID is `wanted`, whatever its case. */
function membersCalled(channel: Channel, self: Member, wanted: string): Member[] {
  if (channel.kind !== "dm") return [];
  return channel.members.filter(
    (member) => member.id !== self.id && (member.id.toLowerCase() === wanted || member.name.toLowerCase() === wanted),
  );
}
