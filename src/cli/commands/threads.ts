import { parseArgs } from "node:util";
import { agentNamed, dmWith, reachChat } from "../talk/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { renderThreads } from "./render-threads.ts";

const threads: Command = {
  name: "threads",
  usage: "<agent> [--json]",
  summary: "List your threads with an agent: ID, when last updated, who is working in it, and its name.",
  details:
    "Most recently updated first, archived threads included. A thread with no name shows the start of its " +
    "first message. --json prints the threads as data. Exits 1 if no gateway or chat server is running.",
  async run(args, io) {
    const { values, positionals } = parsing(() =>
      parseArgs({ args, options: { json: { type: "boolean" } }, allowPositionals: true }),
    );
    const [agent] = expectArguments(positionals, ["<agent>"]);
    const json = values.json === true;

    const reached = await reachChat(io);
    try {
      const dm = dmWith(await reached.connection.chat.channels(), agentNamed(reached.members, agent));
      if (dm === undefined) {
        io.out(json ? "[]" : `You have not talked to ${agent} yet. Start with: shrimpy run ${agent} "<text>"`);
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
