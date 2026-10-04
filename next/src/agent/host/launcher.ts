import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { homePaths } from "../home/index.ts";

/** Used when the agent was started with no PATH at all, so its shell still finds the ordinary commands. */
const ORDINARY_PATH = "/usr/local/bin:/usr/bin:/bin";

/**
 * Make `shrimpy` a command the agent's shell finds, whatever PATH the agent was
 * started with, and whichever Shrimpy is installed elsewhere on this machine:
 * it runs the same Shrimpy as the agent does. `command` is the program and the
 * arguments that run it, such as node and the path of the entry point. The
 * launcher is a file of the home's `runtime/bin`, written again at every start.
 * Returns what the shell adds to the agent's environment: a PATH that begins
 * with the launcher's folder.
 */
export function shellWithShrimpy(home: string, command: readonly string[]): NodeJS.ProcessEnv {
  const { bin } = homePaths(home);
  if (command.length === 0) throw new Error("There is no command to run shrimpy with.");
  if (bin.includes(delimiter)) {
    throw new Error(
      `The agent's shell finds shrimpy in ${bin}, and a PATH can't hold a folder whose path has a "${delimiter}" in it. ` +
        "Move the home to a path without one.",
    );
  }
  mkdirSync(bin, { recursive: true });
  writeLauncher(join(bin, "shrimpy"), command);
  const inherited = process.env.PATH;
  return { PATH: [bin, inherited === undefined || inherited === "" ? ORDINARY_PATH : inherited].join(delimiter) };
}

function writeLauncher(file: string, command: readonly string[]): void {
  const text = `#!/bin/sh\nexec ${command.map(quote).join(" ")} "$@"\n`;
  if (existing(file) === text) return;
  // Written whole or not at all: a shell may be running it as it changes.
  const unfinished = `${file}.${String(process.pid)}`;
  writeFileSync(unfinished, text);
  chmodSync(unfinished, 0o755);
  renameSync(unfinished, file);
}

function existing(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}

/** One word for a POSIX shell, whatever is in it. */
const quote = (word: string): string => `'${word.replaceAll("'", "'\\''")}'`;
