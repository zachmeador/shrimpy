import { mkdirSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { AGENT_HOME_VARIABLE } from "../../contracts/agent/index.ts";
import { saveFile } from "../../lib/files/node.ts";
import { shellWord } from "../../lib/text/index.ts";
import { homePaths } from "../home/index.ts";

/** Used when the agent was started with no PATH at all, so its shell still finds the ordinary commands. */
const ORDINARY_PATH = "/usr/local/bin:/usr/bin:/bin";

/**
 * Make `shrimpy` a command the agent's shell finds, whatever PATH the agent was
 * started with, and whichever Shrimpy is installed elsewhere on this machine:
 * it runs the same Shrimpy as the agent does, and names the agent's home, so
 * that what a command does from this shell is done as the agent. `command` is
 * the program and the arguments that run it, such as node and the path of the
 * entry point. The launcher is a file of the home's `state/runtime/bin`, written again
 * at every start. Returns what the shell adds to the agent's environment: a
 * PATH that begins with the launcher's folder.
 */
export function shellWithShrimpy(home: string, command: readonly string[]): NodeJS.ProcessEnv {
  const { bin, root } = homePaths(home);
  if (command.length === 0) throw new Error("There is no command to run shrimpy with.");
  if (bin.includes(delimiter)) {
    throw new Error(
      `The agent's shell finds shrimpy in ${bin}, and a PATH can't hold a folder whose path has a "${delimiter}" in it. ` +
        "Move the home to a path without one.",
    );
  }
  mkdirSync(bin, { recursive: true, mode: 0o700 });
  writeLauncher(join(bin, "shrimpy"), root, command);
  const inherited = process.env.PATH;
  return { PATH: [bin, inherited === undefined || inherited === "" ? ORDINARY_PATH : inherited].join(delimiter) };
}

function writeLauncher(file: string, home: string, command: readonly string[]): void {
  // The home it names is how a command run from the agent's shell knows it is the agent's.
  const text = `#!/bin/sh\n${AGENT_HOME_VARIABLE}=${shellWord(home)} exec ${command.map(shellWord).join(" ")} "$@"\n`;
  if (existing(file) === text) return;
  // Saved whole: a shell may be running it as it changes.
  saveFile(file, text, { mode: 0o755 });
}

function existing(file: string): string | undefined {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
}
