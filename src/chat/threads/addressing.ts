import type { Member } from "../../contracts/chat/index.ts";
import type { ChannelRecord } from "../store/index.ts";

/** What `@all` stands for. */
const EVERYONE = "all";

// A name is made of letters, digits and these; a dot is part of one only when another of them follows.
const BEFORE_A_MENTION = /[\p{L}\p{N}_]/u;
const INSIDE_A_NAME = /[\p{L}\p{N}_-]/u;

/**
 * Whether lower-cased `text` mentions `name`, which is lower-cased too: `@name`
 * on its own, not inside an address like `maya@host` or a longer name like
 * `@mayamaya`. A full stop after it is the end of a sentence, not the start of
 * another name.
 */
function mentions(text: string, name: string): boolean {
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
 * Who a message is meant for, as IDs in the channel's order of members, and
 * never its author. In a DM that is the other member. In a room it is the
 * members the text mentions as `@name`, matched as names are matched elsewhere,
 * whatever the case, and every member but the author when it says `@all`. A
 * name that is no member's is for nobody.
 */
export function addressedMembers(channel: ChannelRecord, author: Member, text: string): string[] {
  const others = channel.members.filter((member) => member.id !== author.id);
  if (channel.kind === "dm") return others.map((member) => member.id);
  const lowered = text.toLowerCase();
  if (mentions(lowered, EVERYONE)) return others.map((member) => member.id);
  return others.filter((member) => mentions(lowered, member.name.toLowerCase())).map((member) => member.id);
}
