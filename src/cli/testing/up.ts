import type { TestContext } from "node:test";
import { stopAfter, until, useRuntimeDir, within } from "../../lib/testing/index.ts";
import { loadUpWithPace, type Pace } from "../commands/index.ts";
import { captureIo } from "./io.ts";
import { type CliResult, type LaunchOptions, type RunningCommand, shrimpyInBackground } from "./process.ts";

/** Whether a process with this ID is running. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** `shrimpy up`, running. */
export interface RunningUp extends RunningCommand {
  /** The process IDs of the programs it started, from the lines it printed. Programs it found running are not here. */
  programs(): number[];
}

/** The process IDs in the lines `up` printed to say what it started. */
const startedIn = (stdout: string): number[] =>
  [...stdout.matchAll(/^Started .* \(pid (\d+)\)/gm)].map((found) => Number(found[1]));

/**
 * Stop `up` when the test ends as a SIGTERM stops it; if it does not stop
 * cleanly, kill it and the programs it started, so a failing test leaves nothing
 * running.
 */
function stopWhenDone(t: TestContext, up: RunningUp): void {
  stopAfter(t, async () => {
    up.kill("SIGTERM");
    const result = await within(30_000, up.finished, "up stopping").catch(() => undefined);
    if (result?.code === 0) return;
    up.kill("SIGKILL");
    for (const pid of up.programs()) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // It has already stopped.
      }
    }
  });
}

/**
 * Start `shrimpy up` with `args` as its own process, and return at once. It gets
 * the test's runtime directory, unless `options.env` names another, as a
 * second place for agents to live in does. When the test ends it is stopped as
 * a SIGTERM stops it; if it does not stop cleanly, it and the programs it
 * started are killed, so a failing test leaves nothing running.
 */
export function launchUp(t: TestContext, args: string[], options: Pick<LaunchOptions, "env"> = {}): RunningUp {
  useRuntimeDir(t);
  const command = shrimpyInBackground(["up", ...args], { ...options, untilStopped: true });
  const up = { ...command, programs: () => startedIn(command.output().stdout) };
  stopWhenDone(t, up);
  return up;
}

/**
 * `shrimpy up` with the times of `pace`, which a process of its own takes from
 * nothing a test can set. It runs in this process, as the command, and the
 * programs it starts are processes of their own, as ever. Any signal sent to it
 * is the stop request that a SIGTERM is. It is stopped when the test ends as
 * `launchUp` stops `up`.
 */
export function launchUpWithPace(t: TestContext, args: string[], pace: Pace): RunningUp {
  useRuntimeDir(t);
  const cli = captureIo();
  const lines = (said: string[]): string => (said.length === 0 ? "" : `${said.join("\n")}\n`);
  let code: number | null = null;
  const output = (): CliResult => ({ code, stdout: lines(cli.out), stderr: lines(cli.err) });
  // As the command line does, a command that throws has said why and ended with 1.
  const finished = loadUpWithPace(pace)
    .then((command) => command.run(args, cli.io))
    .catch((error: unknown) => {
      cli.io.err(error instanceof Error ? error.message : String(error));
      return 1;
    })
    .then((result) => {
      code = result;
      return output();
    });
  const up: RunningUp = { kill: () => cli.requestStop(), output, finished, programs: () => startedIn(lines(cli.out)) };
  stopWhenDone(t, up);
  return up;
}

/** Wait until `up` says everything is running. */
async function untilRunning(up: RunningUp): Promise<void> {
  const saidRunning = (): boolean => /^(Running\.|Everything is already running\.)/m.test(up.output().stdout);
  await Promise.race([
    until(saidRunning, "up to say it is running", 30_000),
    // With nothing to start it says so and ends at once, perhaps before anyone looked.
    up.finished.then((result) => {
      if (saidRunning()) return;
      throw new Error(`up ended with ${String(result.code)} before it was running:\n${result.stdout}\n${result.stderr}`);
    }),
  ]);
}

/** `launchUp`, and wait until `up` says everything is running. */
export async function startUp(t: TestContext, args: string[], options?: Pick<LaunchOptions, "env">): Promise<RunningUp> {
  const up = launchUp(t, args, options);
  await untilRunning(up);
  return up;
}

/** `launchUpWithPace`, and wait until `up` says everything is running. */
export async function startUpWithPace(t: TestContext, args: string[], pace: Pace): Promise<RunningUp> {
  const up = launchUpWithPace(t, args, pace);
  await untilRunning(up);
  return up;
}
