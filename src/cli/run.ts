import { spawn } from "node:child_process";
import { once } from "node:events";
import type { ConsoleOptions } from "../clients/console/index.ts";
import { asError } from "../lib/errors/index.ts";
import { type Command, loadFamily, setUpIfNeeded } from "./commands/index.ts";
import { lookForHome } from "./folder/index.ts";
import { commandHelp, frontPage, groupHelp, unknownCommand, usageLine } from "./help.ts";
import { commandOf, thisInstall } from "./installed/index.ts";
import { forPeople, type Io } from "./io/index.ts";
import { shrimpyCommand } from "./programs/index.ts";
import type { Account } from "./service/index.ts";
import { UsageError } from "./usage/index.ts";

/** How the console opens: on a new thread with the only agent there is, once it is on the roster, after setting up. */
type Opening = Pick<ConsoleOptions, "startOnLanding">;

export interface RunOptions {
  /**
   * How a bare `shrimpy` at a terminal opens the console, as an exit code. The
   * console itself by default; a test stands in for it.
   */
  openConsole?: (io: Io, opening: Opening) => Promise<number>;
  /** The account a bare `shrimpy` sets a service up for. This process's by default; a test stands in for its service manager. */
  account?: Account;
}

/**
 * Run `shrimpy` with the arguments after its name. The result is the exit
 * code: 0 for success, 2 when the command was used wrongly, and 1 for any
 * other failure. A command may use other codes for results it reports. With no
 * command, at a terminal, it opens the console, after setting the machine up
 * where nothing is set up yet; anywhere else it prints the front page.
 * Whatever is printed for a person is made harmless for a terminal, since
 * much of it was written by other members, agents and tools.
 */
export async function runCli(argv: string[], given: Io, options: RunOptions = {}): Promise<number> {
  const io = forPeople(given);
  const [first] = argv;
  if (first === undefined) {
    if (io.terminal) return runConsole(io, options);
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
    io.err(asError(error).message);
    return 1;
  }
}

/**
 * The console, as a command, after setting the machine up where nothing is set up yet. A failure to open it is said on
 * standard error and is exit code 1, like any other command's.
 */
async function runConsole(io: Io, options: RunOptions): Promise<number> {
  try {
    const setUp = await setUpIfNeeded(io, options.account);
    if (setUp !== undefined && setUp !== 0) return setUp;
    return await (options.openConsole ?? openTheConsole)(io, { startOnLanding: setUp === 0 });
  } catch (error) {
    io.err(asError(error).message);
    return 1;
  }
}

/**
 * The console is only loaded when it is opened, so no other command loads the
 * terminal library. It is handed what a command that talks has: where the
 * gateway is and the token to show it, which is this machine's when the folder
 * has joined a gateway as the person's own. `terminal` and `onDraw` are for a
 * test, which draws on a terminal of its own and waits for the screen it needs.
 */
export async function openTheConsole(io: Io, stand: Pick<ConsoleOptions, "terminal" | "onDraw" | "startOnLanding"> = {}): Promise<number> {
  const { openConsole } = await import("../clients/console/index.ts");
  const { me } = await import("./talk/index.ts");
  const who = me();
  return openConsole({ io, homes: lookForHome, place: who.place, token: who.token, update: updateAndReopen, ...stand });
}

/**
 * What updating this machine does once the console has left the screen:
 * `shrimpy update` with the gateway's version, on this terminal, then the
 * console again on that version, with its own Node. An update that fails
 * leaves what it said on the screen, as one from a checkout does.
 */
async function updateAndReopen(version: string): Promise<number> {
  const [node = process.execPath, ...entry] = shrimpyCommand();
  const updated = await onThisTerminal(node, [...entry, "update", version]);
  const installed = thisInstall();
  if (updated !== 0 || installed === undefined) return updated;
  const [program = node, ...args] = commandOf(installed, version);
  return onThisTerminal(program, args);
}

/** Run `program` with `args` on this terminal, and give its exit code once it ends. */
async function onThisTerminal(program: string, args: string[]): Promise<number> {
  const [code] = (await once(spawn(program, args, { stdio: "inherit" }), "close")) as [number | null];
  return code ?? 1;
}

/** The words that select a command: one for `up`, two for `agent serve`. */
const words = (command: Command): string[] => command.name.split(" ");

/** Whether the arguments start with the words of the command's name. */
const selects = (command: Command, argv: string[]): boolean =>
  words(command).every((word, index) => argv[index] === word);
