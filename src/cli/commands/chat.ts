import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { serveUntilStopped } from "./serve.ts";

const serve: Command = {
  name: "chat serve",
  usage: "<data-dir>",
  summary: "Run the chat server in the foreground until it is told to stop, linked to the gateway. shrimpy up starts it for you.",
  details:
    "The chat server keeps its store in the data directory, which is made if it does not exist. Prints one " +
    "JSON line when it has started. SIGTERM or Ctrl+C stops it. It starts with no gateway running and " +
    "links to the gateway's socket when it finds one, and again each time the gateway comes back. Until it " +
    "has, nobody can reach it, because everyone reaches chat through the gateway.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [given] = expectArguments(positionals, ["<data-dir>"]);
    const dataDir = resolve(given);
    return serveUntilStopped(
      io,
      async () => {
        // Loaded here, so that no other command loads the chat server.
        const { startChat } = await import("../../chat/index.ts");
        return startChat({ dataDir });
      },
      () => ({ event: "started", dataDir, pid: process.pid }),
    );
  },
};

export const chatCommands: Command[] = [serve];
