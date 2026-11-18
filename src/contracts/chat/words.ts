import { oneLine } from "../../lib/plain/index.ts";
import { listed, shellWord } from "../../lib/text/index.ts";
import type { Channel } from "./channel.ts";
import type { Receipt } from "./shapes.ts";
import type { Thread } from "./thread.ts";

/**
 * What a receipt says that a person needs to know, with `who` that left it:
 * "scout failed: …", "scout stopped before answering", "scout skipped this
 * message: …" or "scout skipped this message, because its work was stopped",
 * in the terminal and the commands alike, which each frame it their own way. An
 * answer is the message that follows, and a silent receipt is data nobody is
 * shown, so neither says anything. The name and the detail are put on one line
 * and made harmless here.
 */
export function receiptWords(receipt: Receipt, who: string): string | undefined {
  const name = oneLine(who);
  switch (receipt.status) {
    case "answered":
    case "silent":
      return undefined;
    case "failed":
      return `${name} failed: ${oneLine(receipt.detail ?? "")}`;
    case "stopped":
      return `${name} stopped before answering`;
    // A skipped receipt has no reason only when work was stopped.
    case "skipped":
      return receipt.detail === null
        ? `${name} skipped this message, because its work was stopped`
        : `${name} skipped this message: ${oneLine(receipt.detail)}`;
  }
}

/** What a member in no rooms is told. */
export const NO_ROOMS = "You are in no rooms.";

/**
 * That the caller is in no room called `name`, written without its `#`, and
 * the rooms it is in, by their names: "You are not in a room called #ops. The
 * rooms you are in: #general." A room the caller isn't in is not told apart
 * from one there is none of. The agent's tools and the commands each frame it
 * their own way.
 */
export function notInRoom(name: string, rooms: readonly string[]): string {
  const where = rooms.length === 0 ? NO_ROOMS : `The rooms you are in: ${rooms.map(roomLabel).join(", ")}.`;
  return `You are not in a room called ${roomLabel(name)}. ${where}`;
}

/** That whoever reads it has no DM with `name` yet, which each client follows with its own way to start a thread. */
export const notTalkedTo = (name: string): string => `You have not talked to ${oneLine(name)} yet.`;

/** What a thread with no messages yet shows, and what it is called while it has no name. */
export const NO_MESSAGES = "(no messages yet)";

/** What a thread is called: its name, or the start of its first message, or that it has none yet, on one line. */
export function titleOf(thread: Thread): string {
  return oneLine(thread.name ?? thread.preview ?? NO_MESSAGES);
}

/** What a thread is called, marked when it is the main thread or archived: "deploys [main, archived]". */
export function taggedTitle(thread: Thread): string {
  const tags = [thread.main ? "main" : undefined, thread.archived ? "archived" : undefined].filter((tag) => tag !== undefined);
  return tags.length === 0 ? titleOf(thread) : `${titleOf(thread)} [${tags.join(", ")}]`;
}

/** A room as it is written wherever a person or an agent reads its name: "#ops". */
export const roomLabel = (name: string): string => `#${oneLine(name)}`;

/**
 * A room's name as a command takes it: in double quotes, since a shell reads a
 * bare `#` as the start of a comment, or as `shellWord` quotes it when double
 * quotes would not keep it whole.
 */
export function roomWord(name: string): string {
  const written = roomLabel(name);
  return /^[^"$`\\!]*$/.test(written) ? `"${written}"` : shellWord(written);
}

/** The command that adds the member called `member` to the room `room`, or whoever runs it when their name isn't known. */
export const addToRoom = (room: string, member: string | undefined): string =>
  `shrimpy rooms add ${roomWord(room)} ${member === undefined ? "<your name>" : shellWord(oneLine(member))}`;

/** The names of `members`, each on one line, in alphabetical order. */
export const memberNames = (members: readonly { readonly name: string }[]): string[] =>
  members.map((member) => oneLine(member.name)).sort((a, b) => a.localeCompare(b));

/** Why a DM can't be joined. */
export const DM_TAKES_NO_MORE = "A DM has two members and takes no more.";

/**
 * What a channel is called to the member reading it, whose ID is `you`: a room
 * as `roomLabel` writes it, their own DM by the member it is with, "your DM
 * with scout", and a DM between two others by both, in alphabetical order,
 * "DM between crab and scout".
 */
export function channelLabel(channel: Pick<Channel, "kind" | "name" | "members">, you?: string): string {
  if (channel.kind === "room") return roomLabel(channel.name);
  if (channel.members.some((member) => member.id === you)) return `your DM with ${oneLine(channel.name)}`;
  return `DM between ${listed(memberNames(channel.members))}`;
}
