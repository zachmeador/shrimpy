import type { Command } from "./commands/index.ts";
import { folderPath } from "./folder/index.ts";

/** How a command is typed: its name, then its arguments if it takes any. */
const invocation = (command: Command): string =>
  command.usage === "" ? command.name : `${command.name} ${command.usage}`;

/** The top of a command's help, and what a command used wrongly ends with. */
export const usageLine = (command: Command): string => `Usage: shrimpy ${invocation(command)}`;

/** Where the descriptions start on the front page. */
const COLUMN = 29;

/**
 * What `shrimpy --help` prints: the few commands a person uses, the groups of the rest, and where the Shrimpy folder
 * is. It is written by hand, and a test checks that every command is on it or in a group that is.
 */
export function frontPage(): string {
  const row = (names: string, what: string): string => `${names.padEnd(COLUMN)}${what}`;
  return [
    row("shrimpy", "open the terminal: your agents, rooms and threads"),
    row("shrimpy up", "start Shrimpy here and keep it running"),
    row("shrimpy status", "what is running and who is on the roster"),
    row("shrimpy login", "sign this folder in to a model provider"),
    row('shrimpy run <agent> "..."', "ask an agent once and print its answer"),
    "",
    "Agents",
    row("  agent ...", "make one, see how it's doing"),
    row("  triggers ...", "give an agent work on a schedule"),
    row("  sessions ...", "look at an agent's work, or stop it"),
    row("  wake", "choose what wakes an agent in a room"),
    "",
    "From a shell",
    row("  threads, read", "list and print threads"),
    row("  rooms ...", "list and make rooms"),
    "",
    "More than one machine",
    row("  install, uninstall", "keep Shrimpy running as a service"),
    row("  invite, join", "let an agent or a machine of yours in"),
    row("  members ...", "the roster and who is an admin"),
    "",
    `shrimpy <command> --help says more.    Your folder: ${folderPath()}`,
  ].join("\n");
}

/**
 * The help of a group, such as `agent` or `triggers`: each of its commands with how it is typed and its one line. A
 * group that is also a command, as `triggers` lists triggers, ends with what that command's help says, since it has
 * no help of its own to ask for.
 */
export function groupHelp(group: string, commands: readonly Command[]): string {
  const alone = commands.find((command) => command.name === group);
  return [
    `Usage: shrimpy ${group} ${alone === undefined ? "<command>" : "[<command>]"} [arguments]`,
    "",
    ...commands.flatMap((command) => [`  ${invocation(command)}`, `      ${command.summary}`]),
    ...(alone?.details === undefined ? [] : ["", alone.details]),
    "",
    `Say more about one command with: shrimpy ${group} <command> --help`,
  ].join("\n");
}

/** The help of one command: how it is typed, its one line and what else there is to say. */
export function commandHelp(command: Command): string {
  return [usageLine(command), "", command.summary, command.details].filter((line) => line !== undefined).join("\n");
}

/** What to say of words that are no command, and where to find the ones there are: the group's help if it is a group's. */
export function unknownCommand(argv: readonly string[], group: string | undefined): string {
  const typed = argv.filter((word) => !word.startsWith("-")).slice(0, 2).join(" ") || (argv[0] ?? "");
  return group === undefined
    ? `Unknown command: ${typed}. See the commands with: shrimpy --help`
    : `Unknown command: ${typed}. See the commands of ${group} with: shrimpy ${group} --help`;
}
