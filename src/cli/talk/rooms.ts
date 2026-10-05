import type { Channel } from "../../contracts/chat/index.ts";

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
export function roomNamed(channels: Channel[], written: string): Channel {
  const name = roomNameWritten(written);
  const wanted = name.toLowerCase();
  const rooms = channels.filter((channel) => channel.kind === "room");
  const found = rooms.find((room) => room.name.toLowerCase() === wanted);
  if (found !== undefined) return found;
  const where =
    rooms.length === 0
      ? "You are in no rooms. Make one with: shrimpy rooms new <name> [<member>...]"
      : `The rooms you are in: ${rooms.map((room) => `#${room.name}`).join(", ")}.`;
  throw new Error(`You are not in a room called #${name}. ${where}`);
}
