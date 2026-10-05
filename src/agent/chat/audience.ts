import type { Channel, Member } from "../../contracts/chat/index.ts";
import type { Audience } from "./events.ts";

/**
 * Who a message in `room` was for, from the IDs chat says it is addressed to:
 * whether the agent is among them, the others by name, and whether it was for
 * everyone in the room but its author. A room of two has no everyone: the one
 * member the message is for is named for what they are, the agent or someone else.
 */
export function audienceOf(self: Member, author: Member, addressed: readonly string[], room: Channel): Audience {
  const others = addressed.filter((id) => id !== self.id).flatMap((id) => room.members.find((member) => member.id === id)?.name ?? []);
  const readers = room.members.filter((member) => member.id !== author.id);
  return {
    you: addressed.includes(self.id),
    others,
    everyone: readers.length > 1 && readers.every((member) => addressed.includes(member.id)),
  };
}
