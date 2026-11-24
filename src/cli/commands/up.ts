import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { dataFolder, nothingToStart } from "../folder/index.ts";
import { bringUp, PACE, type Pace, planUp } from "../up/index.ts";
import { parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { LISTEN_OPTION, listenAddresses } from "./listen.ts";
import { AN_AGENT } from "./which-agent.ts";

/** `shrimpy up`. A test makes it with a pace of its own. */
export function upCommand(pace: Pace = PACE): Command {
  return {
    name: "up",
    usage: "[<agent>...] [--data <dir>] [--listen <host:port>]...",
    summary: "Start what is missing on this machine and keep it running: the gateway, the chat server and your agents.",
    details: [
      "With no agents named, it starts every agent in your Shrimpy folder and keeps the folder running, which is " +
        "what the service that shrimpy install sets up runs. An agent made later starts by itself, and one that " +
        "ends is started again, after a pause that grows while it keeps failing. An agent that can't start is " +
        "said once, and tried again after the same pauses or at once when its agent.json changes. An agent whose " +
        "home is taken away is stopped.",
      "With agents named, it starts only those, and stops everything if one of them ends.",
      "Whatever already runs is used as it is and left running. Agents that joined a gateway elsewhere with " +
        "shrimpy join start with no gateway or chat server here, and you talk to them from that gateway's machine.",
      "Ctrl+C or SIGTERM stops what this started, agents first, and exits 0. A second one stops the agents " +
        "without waiting for running turns, and a third ends everything at once. If the gateway or the chat " +
        "server this started ends by itself, this stops the rest and exits 1, so a service starts it all again.",
      "--listen <host:port> opens the gateway, on that address, to agents and machines of yours that are apart " +
        "from it. Give it more than once for more addresses. The gateway keeps them for its next start. With an " +
        "address to listen on, given or kept, this starts the gateway and the chat server in a folder with no " +
        "agents too. shrimpy gateway serve --help says which addresses it takes.",
      "--data <dir> keeps the gateway's and the chat server's data in <dir>, in place of your Shrimpy folder.",
      [
        "Your Shrimpy folder is ~/shrimpy, or the folder SHRIMPY_DIR names:",
        "  agents/          a home for each agent",
        "  removed/         the homes of agents removed from the roster",
        "  providers/       the sign-ins and model servers its agents share",
        "  gateway/, chat/  the data of those programs",
        "  settings.json    your own settings, such as your name",
        "  machine.json     the gateway this machine joined as yours, if it did",
      ].join("\n"),
      AN_AGENT,
    ].join("\n\n"),
    async run(args, io) {
      const { values, positionals } = parsing(() =>
        parseArgs({ args, options: { data: { type: "string" }, ...LISTEN_OPTION }, allowPositionals: true }),
      );
      if (values.data === "") throw new UsageError("--data needs a directory.");
      const listen = listenAddresses(values.listen);
      const given = values.data === undefined ? undefined : resolve(values.data);
      const plan = planUp(positionals, given, listen, dataFolder);
      if (plan === undefined) throw nothingToStart();
      return bringUp(io, plan, pace);
    },
  };
}

export const upCommands: Command[] = [upCommand()];
