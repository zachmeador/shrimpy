import type { Member } from "../../contracts/chat/index.ts";
import type { ChannelRecord } from "../store/index.ts";

/**
 * Who a message is meant for. In a DM that is the other member. Rooms have no
 * mentions yet; when they do, this is where the text is read for them.
 */
export function addressedMembers(channel: ChannelRecord, author: Member, _text: string): string[] {
  if (channel.kind === "room") return [];
  return channel.members.filter((member) => member.id !== author.id).map((member) => member.id);
}
