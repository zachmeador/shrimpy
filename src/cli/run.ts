import type { ConsoleOptions } from "../clients/console/index.ts";
import { type Command, loadFamily } from "./commands/index.ts";
import { lookForHome } from "./folder/index.ts";
import { commandHelp, frontPage, groupHelp, unknownCommand, usageLine } from "./help.ts";
import type { Io } from "./io/index.ts";
import { UsageError } from "./usage/index.ts";

export interface RunOptions {
  /**
   * How a bare `shrimpy` at a terminal opens the console, as an exit code. The
   * console itself by default; a test stands in for it.
   */
  openConsole?: (io: Io) => Promise<number>;
}

/**
 * Run `shrimpy` with the arguments after its name. The result is the exit
 * code: 0 for success, 2 when the command was used wrongly, and 1 for any
 * other failure. A command may use other codes for results it reports. With no
 * command, at a terminal, it opens the console; anywhere else it prints the
 * front page.
 */
export async function runCli(argv: string[], io: Io, options: RunOptions = {}): Promise<number> {
  const [first] = argv;
  if (first === undefined) {
    if (io.terminal) return runConsole(io, options.openConsole ?? openTheConsole);
    io.err(frontPage());
    return 2;
  }
  if (first === "help" || first === "--help" || first === "-h") {
    io.out(frontPage());
    return 0;
  }

  const family = await loadFamily(first);
  // `rooms` and `rooms new` both select `rooms new ops`: the one with more words is the one meant.
  const command = family
    ?.filter((candidate) => selects(candidate, argv))
    .sort((a, b) => words(b).length - words(a).length)[0];
  const rest = argv.slice(command === undefined ? 1 : words(command).length);
  if (rest.includes("--help") || rest.includes("-h")) {
    // A group has commands of more than one word, such as `agent init`. Asked for its help, it lists them.
    const group = family?.some((candidate) => words(candidate).length > 1) === true;
    if (family !== undefined && group && (command === undefined || command.name === first)) {
      io.out(groupHelp(first, family));
      return 0;
    }
    if (command !== undefined) {
      io.out(commandHelp(command));
      return 0;
    }
  }
  if (command === undefined) {
    io.err(unknownCommand(argv, family === undefined ? undefined : first));
    return 2;
  }

  try {
    return await command.run(rest, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(error.message);
      io.err(usageLine(command));
      return 2;
    }
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/** The console, as a command: a failure to open it is said on standard error and is exit code 1, like any other command's. */
async function runConsole(io: Io, open: (io: Io) => Promise<number>): Promise<number> {
  try {
    return await open(io);
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/**
 * The console is only loaded when it is opened, so no other command loads the
 * terminal library. It is handed what a command that talks has: where the
 * gateway is and how to sign in to it, which is the person whose machine this
 * is when it has joined a gateway. `terminal` and `pollMs` are for a test,
 * which draws on a terminal of its own.
 */
export async function openTheConsole(io: Io, stand: Pick<ConsoleOptions, "terminal" | "pollMs"> = {}): Promise<number> {
  const { openConsole } = await import("../clients/console/index.ts");
  const { me } = await import("./talk/index.ts");
  const who = me();
  return openConsole({
    io,
    homes: lookForHome,
    transports: who.transports(),
    signIn: (gateway) => who.signIn(gateway),
    ...stand,
  });
}

/** The words that select a command: one for `up`, two for `agent serve`. */
const words = (command: Command): string[] => command.name.split(" ");

/** Whether the arguments start with the words of the command's name. */
const selects = (command: Command, argv: string[]): boolean =>
  words(command).every((word, index) => argv[index] === word);
