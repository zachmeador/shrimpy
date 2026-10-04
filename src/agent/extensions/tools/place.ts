import type { Context } from "@earendil-works/chord";
import type { DocumentReader } from "@earendil-works/pi-durable";
import type { ChatClient, Member } from "../../../contracts/chat/index.ts";
import type { GatewayConnection, RosterEntry } from "../../../contracts/gateway/index.ts";
import { isDisconnected } from "../../../lib/connection/index.ts";
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
  /** The agent, as chat knows it. */
  self: Member;
  /** The way to the roster, if it is up. */
  gateway: GatewayConnection | undefined;
  /** Whether a DM with a member that there is none with yet is started. Posting starts one; reading does not. */
  startDm: boolean;
  context: Context;
  signal: AbortSignal;
}

/**
 * The thread a tool means. With nothing given it is the thread the turn came
 * from; `@name` is the main thread of the agent's DM with that member of the
 * roster, found through the gateway and made if there is no DM yet. Rooms come
 * with the chat server's rooms.
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

  const roster = await rosterOf(find.gateway);
  if (roster === undefined) return { problem: words.noRoster(name, argument) };
  const wanted = name.toLowerCase();
  const member = roster.find((each) => each.id.toLowerCase() === wanted || each.name.toLowerCase() === wanted);
  if (member === undefined) return { problem: words.nobody(name, roster.map((each) => each.name)) };
  if (member.id === self.id) return { problem: words.yourself(name, argument) };

  const label = words.dmWith(member.name);
  const channel = find.startDm
    ? await find.chat.openDm(member.id, find.signal)
    : (await find.chat.channels(find.signal)).find(
        (each) => each.kind === "dm" && each.members.some((other) => other.id === member.id),
      );
  if (channel === undefined) return { problem: words.noDmYet(member.name) };
  const main = (await find.chat.threads(channel.id, find.signal)).find((thread) => thread.main);
  if (main === undefined) return { problem: words.noMainThread(label) };
  return { threadId: main.id, label, here: false };
}

/** Everyone on the roster, or undefined when the gateway cannot be asked. */
async function rosterOf(gateway: GatewayConnection | undefined): Promise<RosterEntry[] | undefined> {
  if (gateway === undefined) return undefined;
  try {
    return await gateway.members();
  } catch (error) {
    // A connection that drops while asking is the gateway being unreachable too.
    if (isDisconnected(error)) return undefined;
    throw error;
  }
}
