import type { Channel, Member } from "../../contracts/chat/index.ts";

/** Your DM with `member`, among the channels you belong to, or undefined if you have none yet. */
export function dmWith(channels: Channel[], member: Member): Channel | undefined {
  return channels.find((channel) => channel.kind === "dm" && channel.members.some((each) => each.id === member.id));
}
