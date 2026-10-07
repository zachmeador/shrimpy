import { parseArgs } from "node:util";
import { providersFolder } from "../folder/index.ts";
import { parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { signInAtTerminal } from "./signing-in.ts";

const login: Command = {
  name: "providers login",
  usage: "[<provider>]",
  summary: "Sign your Shrimpy folder in to a model provider, for every agent started there.",
  details:
    "Signs in with Pi's own flows, with a subscription or an API key. Name the provider, or leave it out to pick " +
    "from the subscriptions; any other provider is picked by its ID. It shows a link or a code and takes back what " +
    "you paste, so it works over SSH, and it never opens a browser. The sign-in is kept in providers/ in your " +
    "Shrimpy folder, which is ~/shrimpy or the folder SHRIMPY_DIR names. Every agent started there can use it, and " +
    "agents that are already running pick it up with their next request. If providers/default-model.json isn't " +
    "there, it asks which model agents start with when theirs names none. Ctrl+C stops it, and nothing is signed in.",
  async run(args, io) {
    const { positionals } = parsing(() => parseArgs({ args, allowPositionals: true }));
    const [provider, extra] = positionals;
    if (extra !== undefined) throw new UsageError(`Unexpected argument: ${extra}.`);
    return signInAtTerminal(io, providersFolder(), provider);
  },
};

export const providersCommands: Command[] = [login];
