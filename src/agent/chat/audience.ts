import type { Channel, Member } from "../../contracts/chat/index.ts";
import type { Audience } from "../inputs/index.ts";

/**
 * Who a message in `room` was for, from the IDs of the members it mentions:
 * whether the agent is among them, the others by name, and whether it mentioned
 * everyone in the room but its author. A room of two has no everyone: the one
 * member the message is for is named for what they are, the agent or someone else.
 */
export function audienceOf(self: Member, author: Member, mentions: readonly string[], room: Channel): Audience {
  const others = mentions.filter((id) => id !== self.id).flatMap((id) => room.members.find((member) => member.id === id)?.name ?? []);
  const readers = room.members.filter((member) => member.id !== author.id);
  return {
    you: mentions.includes(self.id),
    others,
    everyone: readers.length > 1 && readers.every((member) => mentions.includes(member.id)),
  };
}
