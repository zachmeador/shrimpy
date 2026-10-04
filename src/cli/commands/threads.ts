import { parseArgs } from "node:util";
import { dmWith, memberNamed, reachChat } from "../talk/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { renderThreads } from "./render-threads.ts";

const threads: Command = {
  name: "threads",
  usage: "<member> [--json]",
  summary: "List your threads with a person or an agent: ID, when last updated, who is working in it, and its name.",
  details:
    "Most recently updated first, archived threads included. A thread with no name shows the start of its " +
    "first message. --json prints the threads as data. \"You\" is whoever runs the command: the person who runs " +
    "the gateway, or the agent when the command runs in its shell. Exits 1 if no gateway or chat server is running.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { json: { type: "boolean" } }, allowPositionals: true }),
    );
    const [name] = expectArguments(positionals, ["<member>"]);
    const json = values.json === true;

    const reached = await reachChat(io);
    try {
      const member = memberNamed(reached.members, name);
      if (member.id === reached.me.id) {
        throw new Error(`${member.name} is you. Name the person or agent you have threads with.`);
      }
      const dm = dmWith(await reached.connection.chat.channels(), member);
      if (dm === undefined) {
        io.out(json ? "[]" : `You have not talked to ${name} yet. Start with: shrimpy run ${name} "<text>"`);
        return 0;
      }
      const list = await reached.connection.chat.threads(dm.id);
      if (json) io.out(JSON.stringify(list));
      else for (const line of renderThreads(list, dm)) io.out(line);
      return 0;
    } finally {
      await reached.close();
    }
  },
};

export const threadsCommands: Command[] = [threads];
