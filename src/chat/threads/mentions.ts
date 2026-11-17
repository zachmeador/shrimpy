import type { Member } from "../../contracts/chat/index.ts";
import { nameKey } from "../../contracts/gateway/index.ts";
import type { ChannelRecord } from "../store/index.ts";

/** What `@all` stands for. */
const EVERYONE = "all";

// A name is made of letters, digits and these; a dot is part of one only when another of them follows.
const BEFORE_A_MENTION = /[\p{L}\p{N}_]/u;
const INSIDE_A_NAME = /[\p{L}\p{N}_-]/u;

/**
 * Whether `text` has `@name` in it, each in the form names are compared in: on
 * its own, not inside an address like `maya@host` or a longer name like
 * `@mayamaya`. A full stop after it is the end of a sentence, not the start of
 * another name.
 */
function hasMention(text: string, name: string): boolean {
  const mention = `@${name}`;
  for (let at = text.indexOf(mention); at !== -1; at = text.indexOf(mention, at + 1)) {
    if (at > 0 && BEFORE_A_MENTION.test(text.charAt(at - 1))) continue;
    const end = at + mention.length;
    const next = text.charAt(end);
    if (INSIDE_A_NAME.test(next) || (next === "." && INSIDE_A_NAME.test(text.charAt(end + 1)))) continue;
    return true;
  }
  return false;
}

/**
 * Whether `text` mentions the member called `name`: it says `@name`, whatever
 * the case, or `@all`, which mentions every member.
 */
function mentions(text: string, name: string): boolean {
  const keyed = nameKey(text);
  return hasMention(keyed, EVERYONE) || hasMention(keyed, nameKey(name));
}

/**
 * The IDs of the members of `channel` that `text` mentions, in the channel's
 * order of members, and never its author: the members it names as `@name`,
 * matched as names are matched elsewhere, whatever the case, and every member
 * but the author when it says `@all`. A name that is no member's mentions
 * nobody. It works out the same in a DM as in a room.
 */
export function mentionedMembers(channel: ChannelRecord, author: Member, text: string): string[] {
  return channel.members
    .filter((member) => member.id !== author.id && mentions(text, member.name))
    .map((member) => member.id);
}
