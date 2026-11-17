import { type Channel, findRoom, notInRoom } from "../../contracts/chat/index.ts";

/** What a person runs to make a room. */
export const MAKE_A_ROOM = "Make one with: shrimpy rooms new <name> [<member>...]";

/**
 * The name of a room as a person writes it: `#ops`. The `#` says it is a room
 * and is no part of its name, and a room whose name starts with one is written
 * with two.
 */
export function roomNameWritten(written: string): string {
  return written.startsWith("#") ? written.slice(1) : written;
}

/**
 * The room written `written`, whatever the case, among the channels you belong
 * to. A room you are not in is not told apart from one that does not exist, so
 * the error lists the rooms you are in.
 */
export function roomNamed(channels: readonly Channel[], written: string): Channel {
  const name = roomNameWritten(written);
  const found = findRoom(channels, name);
  if (found !== undefined) return found;
  const rooms = channels.filter((channel) => channel.kind === "room").map((room) => room.name);
  throw new Error(rooms.length === 0 ? `${notInRoom(name, rooms)} ${MAKE_A_ROOM}` : notInRoom(name, rooms));
}
