import type { Command } from "../commands/index.ts";

/**
 * The `shrimpy` command lines in a text: a line that starts with `shrimpy `,
 * with or without a `$ ` before it, and any piece of inline code that does.
 */
export function commandLines(text: string): string[] {
  const lines: string[] = [];
  for (const line of text.split("\n")) {
    const bare = line.trim().replace(/^\$ /, "");
    if (bare.startsWith("shrimpy ")) lines.push(bare);
    for (const [, code = ""] of line.matchAll(/`([^`]+)`/g)) {
      if (code.startsWith("shrimpy ")) lines.push(code);
    }
  }
  return lines;
}

/**
 * Why a command line is not one the CLI has, or undefined when it is: the
 * words after `shrimpy` must start with a command's name, and each flag must be
 * one that command's usage lists.
 */
export function whyNotACommand(line: string, commands: readonly Command[]): string | undefined {
  const [, ...words] = line.split(/\s+/);
  const [first = ""] = words;
  if (first === "help" || first === "--help" || first === "-h") return undefined;

  const end = words.findIndex((word) => !/^[a-z][a-z-]*$/.test(word));
  const bare = end === -1 ? words : words.slice(0, end);
  const command = commands.find((candidate) =>
    candidate.name.split(" ").every((word, index) => bare[index] === word),
  );
  if (command === undefined) return "there is no such command";

  const unknown = words
    .filter((word) => word.startsWith("--"))
    .map((word) => word.split("=")[0] ?? word)
    .filter((flag) => flag !== "--help" && !command.usage.includes(flag));
  return unknown.length === 0 ? undefined : `${command.name} has no ${unknown.join(", ")}`;
}
