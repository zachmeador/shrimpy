import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { firstLine, useRuntimeDir } from "../../lib/testing/index.ts";

const main = fileURLToPath(new URL("../main.ts", import.meta.url));

/** A command that is meant to finish and has not by now is stuck, and is killed so that the test fails instead of hanging. */
const LONGEST_COMMAND_MS = 120_000;

const running = new Set<ChildProcess>();
// A test run that dies must not leave an agent behind.
process.on("exit", () => {
  for (const child of running) child.kill("SIGKILL");
});

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** How a test starts `shrimpy`: the environment it adds to this process's own. */
export interface LaunchOptions {
  env?: Record<string, string>;
  /**
   * The command runs until it is stopped, as a server or `up` does, so it is
   * not held to the time a command that is meant to finish gets. The test
   * stops it.
   */
  untilStopped?: boolean;
}

function launch(args: string[], options: LaunchOptions = {}) {
  const child = spawn(process.execPath, [main, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...options.env },
  });
  running.add(child);
  const stuck = options.untilStopped === true ? undefined : setTimeout(() => child.kill("SIGKILL"), LONGEST_COMMAND_MS);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data: Buffer) => void (stdout += data.toString()));
  child.stderr.on("data", (data: Buffer) => void (stderr += data.toString()));
  const closed = once(child, "close").then(() => {
    clearTimeout(stuck);
    running.delete(child);
  });
  const result = (): CliResult => ({ code: child.exitCode, stdout, stderr });
  return { child, closed, result };
}

/** Run `shrimpy` with `args` as its own process, and wait for it to end. */
export async function shrimpy(args: string[], options?: LaunchOptions): Promise<CliResult> {
  const { closed, result } = launch(args, options);
  await closed;
  return result();
}

/** A `shrimpy` command that is still running. */
export interface RunningCommand {
  /** Send `signal` to the process. */
  kill: (signal: NodeJS.Signals) => void;
  /** What it has printed so far. The code is null until it has ended. */
  output: () => CliResult;
  /** Resolves when the process has ended. */
  finished: Promise<CliResult>;
}

/** Start `shrimpy` with `args` as its own process, and return at once. */
export function shrimpyInBackground(args: string[], options?: LaunchOptions): RunningCommand {
  const { child, closed, result } = launch(args, options);
  return {
    kill: (signal) => void child.kill(signal),
    output: result,
    finished: closed.then(result),
  };
}

/** A `shrimpy` command that serves a program, in its own process. */
export interface Served<Listening> {
  /** The line it printed when it began listening. */
  readonly listening: Listening;
  /** Send `signal` (SIGTERM by default) and wait for the process to end. Safe to call again. */
  stop: (signal?: NodeJS.Signals) => Promise<CliResult>;
}

/**
 * Start `shrimpy` with `args`, which serve a program, and wait until it is
 * listening. It gets the test's runtime directory, which takes its sockets away
 * when the test ends. If it is still running then, it is killed.
 */
async function serving<Listening>(
  t: TestContext,
  args: string[],
  options?: LaunchOptions,
): Promise<Served<Listening>> {
  useRuntimeDir(t);
  const { child, closed, result } = launch(args, { ...options, untilStopped: true });
  const stop = async (signal: NodeJS.Signals = "SIGTERM"): Promise<CliResult> => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    await closed;
    return result();
  };
  t.after(() => stop("SIGKILL"));

  const line = await firstLine(child).catch((error: unknown) => {
    throw new Error(`shrimpy ${args.slice(0, 2).join(" ")} ended before it was listening:\n${result().stderr}`, {
      cause: error,
    });
  });
  return { listening: JSON.parse(line) as Listening, stop };
}

export type ServedAgent = Served<{
  event: string;
  name: string;
  home: string;
  serverId: string;
  socket: string;
  pid: number;
}>;

/** Start `shrimpy agent serve <home>` and wait until it is listening. */
export function serve(
  t: TestContext,
  home: string,
  extra: string[] = [],
  options?: LaunchOptions,
): Promise<ServedAgent> {
  return serving(t, ["agent", "serve", home, ...extra], options);
}

export type ServedGateway = Served<{ event: string; socket: string; webPort: number | null; pid: number }>;

/** Start `shrimpy gateway serve` and wait until it is listening. */
export function serveGateway(t: TestContext, extra: string[] = []): Promise<ServedGateway> {
  return serving(t, ["gateway", "serve", ...extra]);
}

export type ServedChat = Served<{ event: string; dataDir: string; serverId: string; socket: string; pid: number }>;

/** Start `shrimpy chat serve <dataDir>` and wait until it is listening. */
export function serveChat(t: TestContext, dataDir: string): Promise<ServedChat> {
  return serving(t, ["chat", "serve", dataDir]);
}
