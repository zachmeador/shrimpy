import { type Member, mentions } from "../../contracts/chat/index.ts";
import type { ChannelRecord } from "../store/index.ts";

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
