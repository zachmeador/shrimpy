import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const main = fileURLToPath(new URL("../main.ts", import.meta.url));

/** A command that has not ended by now is stuck, and is killed so that the test fails instead of hanging. */
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

function launch(args: string[]) {
  const child = spawn(process.execPath, [main, ...args], { stdio: ["ignore", "pipe", "pipe"] });
  running.add(child);
  const stuck = setTimeout(() => child.kill("SIGKILL"), LONGEST_COMMAND_MS);
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
export async function shrimpy(args: string[]): Promise<CliResult> {
  const { closed, result } = launch(args);
  await closed;
  return result();
}

/** A `shrimpy agent serve` in its own process. */
export interface ServedAgent {
  /** The line it printed when it began listening. */
  readonly listening: { event: string; name: string; home: string; serverId: string; socket: string; pid: number };
  /** Send `signal` (SIGTERM by default) and wait for the process to end. Safe to call again. */
  stop: (signal?: NodeJS.Signals) => Promise<CliResult>;
}

/** Start `shrimpy agent serve <home>`, wait until it is listening, and stop it when the test ends. */
export async function serve(t: TestContext, home: string, extra: string[] = []): Promise<ServedAgent> {
  const { child, closed, result } = launch(["agent", "serve", home, ...extra]);
  const stop = async (signal: NodeJS.Signals = "SIGTERM"): Promise<CliResult> => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    await closed;
    return result();
  };
  t.after(() => stop("SIGKILL"));

  const listening = new Promise<ServedAgent["listening"]>((resolve, reject) => {
    child.stdout.on("data", () => {
      const { stdout } = result();
      if (stdout.includes("\n")) resolve(JSON.parse(stdout.slice(0, stdout.indexOf("\n"))) as ServedAgent["listening"]);
    });
    void closed.then(() => reject(new Error(`shrimpy agent serve ended before it was listening:\n${result().stderr}`)));
  });
  return { listening: await listening, stop };
}
