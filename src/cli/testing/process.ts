import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { type ChildOutput, runChild, startChild, useRuntimeDir } from "../../lib/testing/index.ts";

const main = fileURLToPath(new URL("../main.ts", import.meta.url));

/** What a `shrimpy` command printed, and how it ended once it has. */
export type CliResult = ChildOutput;

/** How a test starts `shrimpy`: the environment it adds to this process's own. */
export interface LaunchOptions {
  env?: Record<string, string>;
}

/**
 * Run `shrimpy` with `args` as its own process, and wait for it to end. One
 * that has not ended in two minutes is stuck, and is killed so that the test
 * fails instead of hanging.
 */
export function shrimpy(args: string[], options: LaunchOptions = {}): Promise<CliResult> {
  return runChild({ file: main, args, env: options.env }).ended;
}

/** A `shrimpy` command that is still running. */
export interface RunningCommand {
  readonly pid: number;
  /** Send `signal` to the process. */
  kill: (signal: NodeJS.Signals) => void;
  /** What it has printed so far. The code is null until it has ended. */
  output: () => CliResult;
  /** Resolves when the process has ended. */
  finished: Promise<CliResult>;
}

/**
 * Start `shrimpy` with `args` as its own process, and return at once. It is
 * killed when the test ends if it is still running, and after two minutes
 * unless `untilStopped` says that it runs until it is stopped, as a server or
 * `up` does.
 */
export function shrimpyInBackground(
  t: TestContext,
  args: string[],
  options: LaunchOptions & { untilStopped?: boolean } = {},
): RunningCommand {
  const child = runChild({ file: main, args, env: options.env }, { t, untilStopped: options.untilStopped });
  return {
    pid: child.pid,
    kill: (signal) => void child.kill(signal),
    output: child.output,
    finished: child.ended,
  };
}

/** The line `agent serve` prints when it begins listening. */
export interface AgentListening {
  event: string;
  name: string;
  home: string;
  socket: string;
  pid: number;
}

/** `shrimpy agent serve`, serving an agent in its own process. */
export interface ServedAgent {
  /** The line it printed when it began listening. */
  readonly listening: AgentListening;
  /** What it has printed so far. The code is null until it has ended. */
  output: () => CliResult;
  /** Send `signal` (SIGTERM by default) and wait for the process to end. Safe to call again. */
  stop: (signal?: NodeJS.Signals) => Promise<CliResult>;
}

/**
 * Start `shrimpy agent serve <home>` and wait until it is listening. It gets the
 * test's runtime directory, unless `options.env` names another, and is killed
 * when the test ends if it is still running.
 */
export async function serve(t: TestContext, home: string, extra: string[] = [], options: LaunchOptions = {}): Promise<ServedAgent> {
  useRuntimeDir(t);
  const args = ["agent", "serve", home, ...extra];
  const child = await startChild<AgentListening>(t, { file: main, args, env: options.env }).catch((error: unknown) => {
    throw new Error(`shrimpy ${args.slice(0, 2).join(" ")}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  });
  return { listening: child.line, output: child.output, stop: child.kill };
}
