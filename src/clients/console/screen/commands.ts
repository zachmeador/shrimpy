import { AGENT_COMMANDS, type AgentCommand } from "../../../contracts/chat/index.ts";
import { TERMINAL_COMMANDS, type TerminalCommand } from "./words.ts";

/** A command the person can write in a thread, with its slash, and what it does where they are. */
export interface CommandLine {
  name: string;
  line: string;
}

/** A command is for the agents or for the terminal, never both, since the terminal would take it before any agent could. This stops compiling when a name is in both. */
const _inOneKind: [Extract<AgentCommand, TerminalCommand>] extends [never] ? true : never = true;

/**
 * Every command that can be written in a thread of a DM with an agent, or of a
 * room, in order of name, each with what it does there: the commands for
 * agents, which are posted for the agents they are for to act on, and the
 * commands for the terminal, which the terminal acts on itself and posts nowhere.
 */
export function commandLines(where: "dm" | "room"): CommandLine[] {
  return Object.entries({ ...AGENT_COMMANDS, ...TERMINAL_COMMANDS })
    .map(([name, lines]) => ({ name: `/${name}`, line: lines[where] }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const isTerminalCommand = (name: string): name is TerminalCommand => Object.hasOwn(TERMINAL_COMMANDS, name);

/**
 * The command for the terminal that a text is, if it is one: all of it, but for
 * the spaces around it, is a slash and the command's name. Anything else that
 * starts with a slash is a message, since a command for the terminal posts
 * nothing and a message that was taken for one would be lost.
 */
export function terminalCommandOf(text: string): TerminalCommand | undefined {
  const name = /^\s*\/(\S+)\s*$/.exec(text)?.[1]?.toLowerCase();
  return name !== undefined && isTerminalCommand(name) ? name : undefined;
}
