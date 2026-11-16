import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { dataFolder, nothingToStart } from "../folder/index.ts";
import { bringUp, lengthOf, PACE, type Pace, planUp } from "../up/index.ts";
import { parsing, UsageError } from "../usage/index.ts";
import type { Command } from "./command.ts";
import { ABOUT_LISTEN, LISTEN_OPTION, listenAddresses } from "./listen.ts";
import { AN_AGENT } from "./which-agent.ts";

/** `shrimpy up`. A test makes it with a pace of its own. */
export function upCommand(pace: Pace = PACE): Command {
  return {
    name: "up",
    usage: "[<agent>...] [--data <dir>] [--listen <host:port>]...",
    summary: "Start what is missing on this machine and keep it running: the gateway, the chat server and your agents.",
    details: [
      "Your Shrimpy folder is ~/shrimpy or the folder SHRIMPY_DIR names. Its agents/ holds the home of each " +
        "agent, providers/ the sign-ins and model servers they share, gateway/ and chat/ the data of those " +
        "programs, and settings.json your own settings, such as your name. If this machine joined a gateway as " +
        "yours, machine.json says which.",
      "With no agents named, it starts every agent in your Shrimpy folder: each folder of agents/ that holds an " +
        "agent.json. The gateway keeps its roster in gateway/ and the chat server its store in chat/, in that " +
        "folder or in the directory --data names, which is made if it is missing. Each program runs as a process " +
        "of its own, the same one that gateway serve, chat serve and agent serve start. A gateway, chat server or " +
        "agent that is already running is used as it " +
        `is, and left running when this stops. ${ABOUT_LISTEN} This passes --listen to the gateway it starts, and ` +
        "says where the gateway listens. A gateway that is already running is used as it is, so --listen can't " +
        "change it, and this says so. When it is told to listen, by --listen or by the addresses the gateway kept, " +
        "it starts the gateway and the chat server in a folder with no agents too, since agents elsewhere can join " +
        "it. When every agent it is to start belongs to a gateway elsewhere, because it joined one with shrimpy " +
        "join, this starts those agents and no gateway or chat server, unless it is told to listen: they are " +
        "talked to from the gateway's machine. With some agents that belong elsewhere and some that don't, it " +
        "starts the gateway and the chat server as usual, and all the agents. Ctrl+C or SIGTERM stops what this " +
        "started, agents first, and exits 0 once they have stopped; a second request tells the agents to stop " +
        "without waiting for running turns, and a third ends everything at once.",
      "With no agents named, it also keeps the folder running, which is what a service runs. Every " +
        `${lengthOf(pace.lookMs)} it looks at the homes in agents/ and starts the agent of any home that has ` +
        "none running, so an agent made while this runs starts by itself. An agent this started that ends by " +
        "itself is reported with how it ended, and is started again alone, after a pause that grows from " +
        `${lengthOf(pace.pauseMs)} to ${lengthOf(pace.longestPauseMs)} while it keeps failing and starts over once ` +
        `it has stayed up for ${lengthOf(pace.stableMs)}. A home whose agent can't start is reported once, with ` +
        "what the agent said, and tried again after the same pauses, and at once when its agent.json changes. An " +
        "agent that someone else started is used as it is, and this starts the home's agent when that one ends. " +
        "The agent this started at a home that is taken away is stopped. If the gateway or the chat server this " +
        "started ends by itself, this says which, stops the rest and exits 1, so whatever keeps this running " +
        "starts it all again.",
      "With agents named, it starts those and follows nothing: if one of them, or the gateway or the chat " +
        `server this started, ends by itself, this says which, stops the rest and exits 1. ${AN_AGENT}`,
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
