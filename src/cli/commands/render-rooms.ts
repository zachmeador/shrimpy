import type { Channel } from "../../contracts/chat/index.ts";
import { localTime } from "../../lib/time/index.ts";
import { renderTable } from "./table.ts";

/** A room you are in, and when it was last updated: when its newest thread was. */
export interface RoomListing {
  room: Channel;
  updatedAt: number;
}

/** The rooms as a table: the room, when it was last updated, and who is in it. */
export function renderRooms(rooms: RoomListing[]): string[] {
  const rows = rooms.map(({ room, updatedAt }) => [
    `#${room.name}`,
    localTime(updatedAt),
    room.members
      .map((member) => member.name)
      .sort((a, b) => a.localeCompare(b))
      .join(", "),
  ]);
  return renderTable(["room", "updated", "members"], rows);
}
