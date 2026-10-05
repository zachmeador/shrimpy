import { type Member, mentions } from "../../contracts/chat/index.ts";
import type { ChannelRecord } from "../store/index.ts";

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
  return others.filter((member) => mentions(text, member.name)).map((member) => member.id);
}
