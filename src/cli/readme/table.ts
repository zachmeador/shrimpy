import type { Command } from "../commands/index.ts";

/** The lines that mark where the README's table of commands begins and ends. */
export const COMMANDS_START = "<!-- commands:start -->";
export const COMMANDS_END = "<!-- commands:end -->";

/** The commands as a Markdown table: how each is typed, and its one-line summary. */
export function commandTable(commands: readonly Command[]): string {
  const cell = (text: string): string => text.replaceAll("|", "\\|");
  const rows = commands.map((command) => {
    const typed = command.usage === "" ? command.name : `${command.name} ${command.usage}`;
    return `| \`${cell(typed)}\` | ${cell(command.summary)} |`;
  });
  return ["| Command | What it does |", "|---|---|", ...rows].join("\n");
}

/** `readme` with the text between the two markers replaced by `table`. */
export function withCommandTable(readme: string, table: string): string {
  const start = readme.indexOf(COMMANDS_START);
  const end = readme.indexOf(COMMANDS_END);
  if (start === -1 || end === -1 || end < start || readme.indexOf(COMMANDS_START, start + 1) !== -1) {
    throw new Error(`The README needs one ${COMMANDS_START} line followed by one ${COMMANDS_END} line around its table of commands.`);
  }
  return `${readme.slice(0, start + COMMANDS_START.length)}\n${table}\n${readme.slice(end)}`;
}
