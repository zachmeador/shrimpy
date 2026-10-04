import { type Command, loadAll, loadFamily } from "./commands/index.ts";
import type { Io } from "./io/index.ts";
import { currentPerson } from "./talk/index.ts";
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
 * command, at a terminal, it opens the console; anywhere else it lists the
 * commands.
 */
export async function runCli(argv: string[], io: Io, options: RunOptions = {}): Promise<number> {
  const [family] = argv;
  if (family === undefined) {
    if (io.terminal) return (options.openConsole ?? openTheConsole)(io);
    io.err(await overview());
    return 2;
  }
  if (family === "help" || family === "--help" || family === "-h") {
    io.out(await overview());
    return 0;
  }

  const command = (await loadFamily(family))?.find((candidate) => selects(candidate, argv));
  if (command === undefined) {
    io.err(`Unknown command: ${argv.filter((word) => !word.startsWith("-")).slice(0, 2).join(" ")}`);
    io.err(await overview());
    return 2;
  }
  const rest = argv.slice(words(command).length);
  if (rest.includes("--help") || rest.includes("-h")) {
    io.out([describe(command), "", command.summary, command.details].filter((line) => line !== undefined).join("\n"));
    return 0;
  }

  try {
    return await command.run(rest, io);
  } catch (error) {
    if (error instanceof UsageError) {
      io.err(error.message);
      io.err(describe(command));
      return 2;
    }
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/** The console is only loaded when it is opened, so no other command loads the terminal library. */
async function openTheConsole(io: Io): Promise<number> {
  const { openConsole } = await import("../clients/console/index.ts");
  try {
    return await openConsole({ me: currentPerson(), io });
  } catch (error) {
    io.err(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

/** The words that select a command: one for `up`, two for `agent serve`. */
const words = (command: Command): string[] => command.name.split(" ");

/** Whether the arguments start with the words of the command's name. */
const selects = (command: Command, argv: string[]): boolean =>
  words(command).every((word, index) => argv[index] === word);

/** How a command is typed: its name, then its arguments if it takes any. */
function invocation(command: Command): string {
  return command.usage === "" ? command.name : `${command.name} ${command.usage}`;
}

function describe(command: Command): string {
  return `Usage: shrimpy ${invocation(command)}`;
}

async function overview(): Promise<string> {
  const lines = (await loadAll()).flatMap((command) => [`  ${invocation(command)}`, `      ${command.summary}`]);
  return ["Usage: shrimpy <command> [arguments]", "", "Commands:", ...lines].join("\n");
}
