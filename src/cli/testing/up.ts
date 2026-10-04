import type { TestContext } from "node:test";
import { stopAfter, until, useRuntimeDir, within } from "../../lib/testing/index.ts";
import { type RunningCommand, shrimpyInBackground } from "./process.ts";

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

/**
 * Start `shrimpy up` with `args` as its own process, and return at once. It gets
 * the test's runtime directory. When the test ends it is stopped as a SIGTERM
 * stops it; if it does not stop cleanly, it and the programs it started are
 * killed, so a failing test leaves nothing running.
 */
export function launchUp(t: TestContext, args: string[]): RunningUp {
  useRuntimeDir(t);
  const command = shrimpyInBackground(["up", ...args]);
  const programs = (): number[] =>
    [...command.output().stdout.matchAll(/^Started .* \(pid (\d+)\)/gm)].map((found) => Number(found[1]));
  stopAfter(t, async () => {
    command.kill("SIGTERM");
    const result = await within(30_000, command.finished, "up stopping").catch(() => undefined);
    if (result?.code === 0) return;
    command.kill("SIGKILL");
    for (const pid of programs()) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // It has already stopped.
      }
    }
  });
  return { ...command, programs };
}

/** `launchUp`, and wait until `up` says everything is running. */
export async function startUp(t: TestContext, args: string[]): Promise<RunningUp> {
  const up = launchUp(t, args);
  const saidRunning = (): boolean => /^(Running\.|Everything is already running\.)/m.test(up.output().stdout);
  await Promise.race([
    until(saidRunning, "up to say it is running", 30_000),
    // With nothing to start it says so and ends at once, perhaps before anyone looked.
    up.finished.then((result) => {
      if (saidRunning()) return;
      throw new Error(`up ended with ${String(result.code)} before it was running:\n${result.stdout}\n${result.stderr}`);
    }),
  ]);
  return up;
}
