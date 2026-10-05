import { parseArgs } from "node:util";
import type { Channel } from "../../contracts/chat/index.ts";
import { dmWith, memberNamed, type Reached, reachChat, roomNamed } from "../talk/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { renderThreads } from "./render-threads.ts";

const threads: Command = {
  name: "threads",
  usage: "<member|#room> [--json]",
  summary:
    "List your threads with a person or an agent, or in a room: ID, when last updated, who is working in it, and its name.",
  details:
    "Most recently updated first, archived threads included. A thread with no name shows the start of its " +
    "first message. A room is written #name, in quotes, since a shell treats an unquoted # as the start of a " +
    "comment. --json prints the threads as data. \"You\" is whoever runs the command: the person who runs " +
    "the gateway, or the agent when the command runs in its shell. Exits 1 if no gateway or chat server is running.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { json: { type: "boolean" } }, allowPositionals: true }),
    );
    const [name] = expectArguments(positionals, ["<member|#room>"]);
    const json = values.json === true;

    const reached = await reachChat(io);
    try {
      const channel = channelNamed(reached, await reached.connection.chat.channels(), name);
      if (channel === undefined) {
        io.out(json ? "[]" : `You have not talked to ${name} yet. Start with: shrimpy run ${name} "<text>"`);
        return 0;
      }
      const list = await reached.connection.chat.threads(channel.id);
      if (json) io.out(JSON.stringify(list));
      else for (const line of renderThreads(list, channel)) io.out(line);
      return 0;
    } finally {
      await reached.close();
    }
  },
};

/** The channel `name` means: a room written #name, or your DM with a member, which you may not have yet. */
function channelNamed(reached: Reached, channels: Channel[], name: string): Channel | undefined {
  if (name.startsWith("#")) return roomNamed(channels, name);
  const member = memberNamed(reached.members, name);
  if (member.id === reached.me.id) {
    throw new Error(`${member.name} is you. Name the person or agent you have threads with.`);
  }
  return dmWith(channels, member);
}

export const threadsCommands: Command[] = [threads];
