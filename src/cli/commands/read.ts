import { parseArgs } from "node:util";
import type { ChatConnection, Message, Thread } from "../../contracts/chat/index.ts";
import { reachChat } from "../talk/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { renderThread } from "./render-threads.ts";

/** Messages asked for at a time when reading back through a thread. */
const PAGE = 200;

const read: Command = {
  name: "read",
  usage: "<thread> [--json]",
  summary: "Show a thread: who said what and when, oldest first, with the message IDs that edit, delete and react take.",
  details:
    "Messages are shown as they now stand: an edited one says when, a deleted one says it was deleted, and the " +
    "emoji on a message are listed with who put them there. Where an agent failed, stopped or skipped a message, " +
    "a line below it says so. A silent receipt is not shown. --json prints the thread and every message with " +
    "all its receipts, silent ones included. Exits 1 if no gateway or chat server is running, or the thread is " +
    "not one of yours.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { json: { type: "boolean" } }, allowPositionals: true }),
    );
    const [threadId] = expectArguments(positionals, ["<thread>"]);

    const reached = await reachChat(io);
    try {
      const { thread, messages } = await wholeThread(reached.connection, threadId);
      if (values.json === true) {
        io.out(JSON.stringify({ thread, messages }));
        return 0;
      }
      const channel = (await reached.connection.chat.channels()).find((candidate) => candidate.id === thread.channelId);
      if (channel === undefined) throw new Error(`Thread ${threadId} is in a channel you do not belong to.`);
      for (const line of renderThread(thread, messages, channel)) io.out(line);
      return 0;
    } finally {
      await reached.close();
    }
  },
};

/** The thread and every message in it, oldest first: the live view's newest messages, and the pages before them. */
async function wholeThread(connection: ChatConnection, threadId: string): Promise<{ thread: Thread; messages: Message[] }> {
  let view;
  try {
    view = (await connection.attach(threadId)).view;
  } catch (error) {
    const message = (error as Error).message;
    if (!message.startsWith("Unknown thread")) throw error;
    throw new Error(`${message}. See the threads of a conversation with: shrimpy threads <member>`, { cause: error });
  }
  let messages = view.messages;
  let remaining = view.earlier;
  while (remaining > 0 && messages[0] !== undefined) {
    const earlier = await connection.chat.read(threadId, messages[0].seq, PAGE);
    if (earlier.length === 0) break;
    messages = [...earlier, ...messages];
    remaining -= earlier.length;
  }
  return { thread: view.thread, messages };
}

export const readCommands: Command[] = [read];
