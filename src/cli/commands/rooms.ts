import { parseArgs } from "node:util";
import { memberNames, NO_ROOMS, roomLabel } from "../../contracts/chat/index.ts";
import { contextOf, MAX_NAME, valueOf } from "../../contracts/gateway/index.ts";
import { listed } from "../../lib/text/index.ts";
import { MAKE_A_ROOM, membersNamed, onChannel, reachChat, roomNamed, roomNameWritten } from "../talk/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { renderRooms } from "./render-rooms.ts";

const rooms: Command = {
  name: "rooms",
  usage: "",
  summary: "List the rooms you are in, each with its members and when it was last updated.",
  details:
    "Rooms are listed most recently updated first. \"You\" is whoever runs the command: the person who runs the " +
    "gateway, or the agent when the command runs in its shell. Exits 1 if no gateway or chat server is running.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    expectArguments(positionals, []);

    const reached = await reachChat(io);
    try {
      const mine = reached.chat.channels.value.filter((channel) => channel.kind === "room");
      if (mine.length === 0) {
        io.out(`${NO_ROOMS} ${MAKE_A_ROOM}`);
        return 0;
      }
      const listing = await Promise.all(
        mine.map(async (room) => ({
          room,
          // A room is as new as its newest thread, and every room has a main thread.
          updatedAt: Math.max(...(await onChannel(reached.client, room.id, (held) => held.threads.value)).map((thread) => thread.updatedAt)),
        })),
      );
      for (const line of renderRooms(listing.sort((a, b) => b.updatedAt - a.updatedAt))) io.out(line);
      return 0;
    } finally {
      await reached.close();
    }
  },
};

const roomsNew: Command = {
  name: "rooms new",
  usage: "<name> [<member>...]",
  summary: "Make a room, with you and the members you name in it. Takes an admin.",
  details:
    "Making a room takes an admin: every person is one, the first agent to join the gateway starts as one, and " +
    "any other agent becomes one when it is promoted. An admin can name anyone on the roster as a member. Every " +
    "name is checked before anything is made, and the error says which name is wrong. A room's name is one line " +
    `of up to ${String(MAX_NAME)} characters that no other room has, whatever the case. Members read and post in the room, and a ` +
    "member who is an admin can add more. A member added later can read what came before, and is only told of " +
    "what comes after. To write the name as #ops, put it in quotes: a shell treats an unquoted # as the start of " +
    "a comment.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [written, ...named] = positionals;
    if (written === undefined) throw new UsageError("Missing <name>.");
    const name = roomNameWritten(written).trim();
    if (name === "") throw new UsageError("The room's name is empty.");

    const reached = await reachChat(io);
    try {
      const members = membersNamed(reached.members, named);
      const room = valueOf(await reached.chat.createRoom({ name, members: members.map((member) => member.id) }, contextOf()));
      io.out(`Made the room ${roomLabel(room.name)} with ${listed(memberNames(room.members))}.`);
      return 0;
    } finally {
      await reached.close();
    }
  },
};

const roomsAdd: Command = {
  name: "rooms add",
  usage: "<room> <member>...",
  summary: "Add members to a room you are in. Takes an admin.",
  details:
    "Name the room as #name, in quotes, or as its name alone. Adding takes an admin who is in the room. You, " +
    "the person, can add to any room, which is how you join one you only read. Anyone on the roster can be added. Every name is checked before anyone is added, and the error says " +
    "which name is wrong. A member added can read what came before, and is only told of what comes after.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [written, ...named] = positionals;
    if (written === undefined) throw new UsageError("Missing <room>.");
    if (named.length === 0) throw new UsageError("Missing <member>.");

    const reached = await reachChat(io);
    try {
      // The person adds to any room, one they only read included, which is how they walk into it. An agent reads no others.
      const { chat } = reached;
      const room = roomNamed([...chat.channels.value, ...chat.readOnlyChannels.value], written);
      const members = membersNamed(reached.members, named);
      const there = new Set(room.members.map((member) => member.id));
      valueOf(await chat.addMembers({ channel: room.id, members: members.map((member) => member.id) }, contextOf()));
      const newcomers = members.filter((member) => !there.has(member.id));
      const before = members.filter((member) => there.has(member.id));
      if (newcomers.length === 0) {
        io.out(`${listed(memberNames(before))} ${before.length === 1 ? "is" : "are"} in ${roomLabel(room.name)} already.`);
      } else {
        const already = before.length === 0 ? "" : ` ${listed(memberNames(before))} ${before.length === 1 ? "was" : "were"} in it already.`;
        io.out(`Added ${listed(memberNames(newcomers))} to ${roomLabel(room.name)}.${already}`);
      }
      return 0;
    } finally {
      await reached.close();
    }
  },
};

export const roomsCommands: Command[] = [rooms, roomsNew, roomsAdd];
