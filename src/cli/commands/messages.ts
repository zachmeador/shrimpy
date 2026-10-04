import { parseArgs } from "node:util";
import type { ChatClient } from "../../contracts/chat/index.ts";
import type { Io } from "../io/index.ts";
import { reachChat } from "../talk/index.ts";
import { expectArguments, parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";

// These act as whoever runs them, like `run`: the person who runs the gateway, or the
// agent when the command runs in its shell. A message's ID is the one `shrimpy read` shows.

const MESSAGE_IDS = "The IDs of a thread's messages are shown by: shrimpy read <thread>";

/** Reach chat, do one thing to a message, and say what was done. A refusal says why, and what an unknown message needs. */
async function onMessage(io: Io, change: (chat: ChatClient) => Promise<string>): Promise<number> {
  const reached = await reachChat(io);
  try {
    io.out(await change(reached.connection.chat));
    return 0;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Unknown message")) {
      throw new Error(`${error.message}. ${MESSAGE_IDS}`, { cause: error });
    }
    throw error;
  } finally {
    await reached.close();
  }
}

const edit: Command = {
  name: "edit",
  usage: "<message> <text>",
  summary: "Change what one of your messages says.",
  details:
    "Only a message's author can edit it, and the author is whoever runs the command. Editing a message to what it " +
    "already says changes nothing. A deleted message can't be edited. Exits 1 if the message isn't yours, or isn't " +
    `one you can see. ${MESSAGE_IDS}`,
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [message, text] = expectArguments(positionals, ["<message>", "<text>"]);
    if (text.trim() === "") throw new UsageError("The text is empty.");
    return onMessage(io, async (chat) => {
      await chat.edit(message, text);
      return `Edited ${message}.`;
    });
  },
};

const remove: Command = {
  name: "delete",
  usage: "<message>",
  summary: "Delete one of your messages: it keeps its place in the thread and loses its text.",
  details:
    "Only a message's author can delete it, and the author is whoever runs the command. Its reactions go with it, " +
    `and so does its text in the log of events. Deleting a deleted message changes nothing. ${MESSAGE_IDS}`,
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [message] = expectArguments(positionals, ["<message>"]);
    return onMessage(io, async (chat) => {
      await chat.delete(message);
      return `Deleted ${message}.`;
    });
  },
};

const react: Command = {
  name: "react",
  usage: "<message> <emoji>",
  summary: "Put an emoji on a message, as a member of the channel it is in.",
  details:
    "The emoji is a single one, such as 👍. Reacting with the same emoji twice is one reaction. A deleted message " +
    `takes none. ${MESSAGE_IDS}`,
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [message, emoji] = expectArguments(positionals, ["<message>", "<emoji>"]);
    return onMessage(io, async (chat) => {
      await chat.react(message, emoji);
      return `Reacted with ${emoji} to ${message}.`;
    });
  },
};

const unreact: Command = {
  name: "unreact",
  usage: "<message> <emoji>",
  summary: "Take back your emoji from a message.",
  details: `Taking back an emoji that isn't there changes nothing. ${MESSAGE_IDS}`,
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [message, emoji] = expectArguments(positionals, ["<message>", "<emoji>"]);
    return onMessage(io, async (chat) => {
      await chat.unreact(message, emoji);
      return `Took ${emoji} back from ${message}.`;
    });
  },
};

export const messageCommands: Command[] = [edit, remove, react, unreact];
