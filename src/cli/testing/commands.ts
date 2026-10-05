import type { Command } from "../commands/index.ts";

/** The words of a text, a quoted string being one word. */
const wordsOf = (text: string): string[] => text.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];

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
 * What a usage line takes, read as it is written: a flag that is followed by a
 * value, such as `--agent <agent>`, a flag that stands alone, such as `[--wait]`,
 * and how many arguments there are, any number of them when one ends in `...`.
 */
function takes(usage: string): { flags: Map<string, boolean>; arguments: number; any: boolean } {
  const flags = new Map<string, boolean>();
  const words = wordsOf(usage);
  let count = 0;
  let any = false;
  for (let at = 0; at < words.length; at += 1) {
    const word = words[at] ?? "";
    const bare = word.replace(/^[[(]+|[\])]+$/g, "");
    if (bare === "" || bare === "|") continue;
    if (bare.startsWith("--")) {
      const hasValue = !/[\])]$/.test(word);
      flags.set(bare, hasValue);
      if (hasValue) at += 1;
    } else {
      count += 1;
      if (bare.endsWith("...")) any = true;
    }
  }
  return { flags, arguments: count, any };
}

/**
 * Why a command line is not one the CLI has, or undefined when it is: the words
 * after `shrimpy` must start with a command's name, each flag must be one that
 * command's usage lists, and the line must not give more arguments than the
 * usage has.
 */
export function whyNotACommand(line: string, commands: readonly Command[]): string | undefined {
  const [, ...words] = wordsOf(line);
  const [first = ""] = words;
  if (first === "help" || first === "--help" || first === "-h") return undefined;

  const end = words.findIndex((word) => !/^[a-z][a-z-]*$/.test(word));
  const bare = end === -1 ? words : words.slice(0, end);
  const command = commands
    .filter((candidate) => candidate.name.split(" ").every((word, index) => bare[index] === word))
    .sort((a, b) => b.name.split(" ").length - a.name.split(" ").length)[0];
  if (command === undefined) return "there is no such command";

  const { flags, arguments: count, any } = takes(command.usage);
  const given: string[] = [];
  const unknown: string[] = [];
  const rest = words.slice(command.name.split(" ").length);
  for (let at = 0; at < rest.length; at += 1) {
    const word = rest[at] ?? "";
    if (!word.startsWith("--")) {
      given.push(word);
      continue;
    }
    const flag = word.split("=")[0] ?? word;
    if (flag === "--help") continue;
    const hasValue = flags.get(flag);
    if (hasValue === undefined) unknown.push(flag);
    else if (hasValue && !word.includes("=")) at += 1;
  }
  if (unknown.length > 0) return `${command.name} has no ${unknown.join(", ")}`;
  if (!any && given.length > count) {
    const limit = count === 0 ? "no arguments" : `at most ${String(count)} ${count === 1 ? "argument" : "arguments"}`;
    return `${command.name} takes ${limit}, and this gives ${given.join(" ")}`;
  }
  return undefined;
}
