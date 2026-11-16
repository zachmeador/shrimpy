import { parseArgs } from "node:util";
import { type Message, Thread } from "../../contracts/chat/index.ts";
import { contextOf, valueOf } from "../../contracts/gateway/index.ts";
import { type Reached, reachChat } from "../talk/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { renderThread } from "./render-threads.ts";

/** Messages asked for at a time when reading back through a thread. */
const PAGE = 200;

const read: Command = {
  name: "read",
  usage: "<thread> [--json]",
  summary: "Show a thread: who said what and when, oldest first, with each message's ID.",
  details:
    "Messages are shown as they now stand: an edited one says when, a deleted one says it was deleted, and the " +
    "emoji on a message are listed with who put them there. Where an agent failed, stopped or skipped a message, " +
    "a line below it says so. A silent receipt is not shown. --json prints the thread and every message with " +
    "all its receipts, silent ones included. A person can read any thread, a DM between two agents included; an " +
    "agent can read only the threads it is in. Exits 1 if no gateway or chat server is running, or you can't " +
    "read the thread.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { json: { type: "boolean" } }, allowPositionals: true }),
    );
    const [threadId] = expectArguments(positionals, ["<thread>"]);

    const reached = await reachChat(io);
    try {
      const { thread, messages } = await wholeThread(reached, threadId);
      if (values.json === true) {
        io.json({ thread, messages });
        return 0;
      }
      const { chat } = reached;
      const channel =
        chat.channels.value.find((candidate) => candidate.id === thread.channelId) ??
        chat.readOnlyChannels.value.find((candidate) => candidate.id === thread.channelId);
      if (channel === undefined) throw new Error(`Thread ${threadId} is in a channel you can't read.`);
      for (const line of renderThread(thread, messages, channel, reached.me)) io.out(line);
      return 0;
    } finally {
      await reached.close();
    }
  },
};

/** The thread and every message in it, oldest first: the live view's newest messages, and the pages before them. */
async function wholeThread(reached: Reached, threadId: string): Promise<{ thread: Thread; messages: Message[] }> {
  const held = await reached.client.host.get(Thread, { thread: threadId }, contextOf());
  try {
    // Chat refuses a member a thread that is not there and one it may not read alike, and reachChat let only a member
    // this far, so every refusal of a thread here is one that the threads of a conversation can help with.
    const refusal = held.refusal.value;
    if (refusal !== null) {
      throw new Error(`${refusal.words.replace(/\.$/, "")}. See the threads of a conversation with: shrimpy threads <member|#room>`);
    }
    const thread = held.thread.value;
    if (thread === null) throw new Error(`Chat did not say what thread ${threadId} is.`);
    let messages = held.messages.value;
    let remaining = held.earlier.value;
    while (remaining > 0 && messages[0] !== undefined) {
      const earlier = valueOf(await held.read({ before: messages[0].seq, limit: PAGE }, contextOf()));
      if (earlier.length === 0) break;
      messages = [...earlier, ...messages];
      remaining -= earlier.length;
    }
    return { thread, messages };
  } finally {
    held.release();
  }
}

export const readCommands: Command[] = [read];
