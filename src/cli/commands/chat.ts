import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { startChat } from "../../chat/index.ts";
import { expectArguments, parsing } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { serveUntilStopped } from "./serve.ts";

const serve: Command = {
  name: "chat serve",
  usage: "<data-dir>",
  summary: "Run the chat server in the foreground until it is told to stop, registered with the gateway.",
  details:
    "The chat server keeps its store in the data directory, which is made if it does not exist. Prints one " +
    "JSON line when it is listening. SIGTERM or Ctrl+C stops it. It starts with no gateway running and " +
    "registers when it finds one, and again each time the gateway comes back. Until it has, nobody can " +
    "come in, because only the gateway can say who they are.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, options: {}, allowPositionals: true }));
    const [given] = expectArguments(positionals, ["<data-dir>"]);
    const dataDir = resolve(given);
    return serveUntilStopped(
      io,
      () => startChat({ dataDir }),
      (chat) => ({ event: "listening", dataDir, ...chat.endpoint }),
    );
  },
};

export const chatCommands: Command[] = [serve];
