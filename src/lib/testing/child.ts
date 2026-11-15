import { type ChildProcess, spawn } from "node:child_process";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { stopAfter } from "./cleanup.ts";

/** What to run in a child: a script file, or the source of a module, and what it adds to the environment it inherits. */
export type ChildProgram = ({ file: string | URL; args?: string[] } | { source: string }) & { env?: Record<string, string> };

/** What a child printed, and how it ended once it has: with an exit code, or by a signal. */
export interface ChildOutput {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

/** A child running as a process of its own. */
export interface RunningChild {
  readonly pid: number;
  /** What it has printed so far. The code and the signal are null until it has ended. */
  readonly output: () => ChildOutput;
  /** Settles when it has ended and everything it printed is in. */
  readonly ended: Promise<ChildOutput>;
  /** Send `signal`, SIGTERM unless another is given, unless it has ended, and wait until it has. */
  readonly kill: (signal?: NodeJS.Signals) => Promise<ChildOutput>;
  /** The first line it prints to standard output, without its line break. Rejects, with what it said, if it ends first. */
  readonly firstLine: Promise<string>;
}

/** A child that has said it is ready. */
export interface Child<Line> extends RunningChild {
  /** The JSON line it printed to say it was ready. */
  readonly line: Line;
}

/** A child that is meant to end by itself and has not by now is stuck, and is killed so that the test fails instead of hanging. */
const LONGEST_MS = 120_000;

const running = new Set<ChildProcess>();
// A test run that dies must not leave a child behind.
process.on("exit", () => {
  for (const child of running) child.kill("SIGKILL");
});

const howItEnded = ({ code, signal }: ChildOutput): string => (signal === null ? `exit code ${String(code)}` : `signal ${signal}`);

/**
 * Run `program` with this process's node, as a process of its own that inherits
 * the environment, SHRIMPY_RUNTIME_DIR included, and keep what it prints. It is
 * killed when this process exits, when the test ends if it is given `t`, and
 * after two minutes unless `untilStopped` says that it runs until it is stopped.
 */
export function runChild(program: ChildProgram, options: { t?: TestContext; untilStopped?: boolean } = {}): RunningChild {
  const argv =
    "source" in program
      ? ["--input-type=module", "-e", program.source]
      : [typeof program.file === "string" ? program.file : fileURLToPath(program.file), ...(program.args ?? [])];
  const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...program.env } });
  running.add(child);
  const stuck = options.untilStopped === true ? undefined : setTimeout(() => child.kill("SIGKILL"), LONGEST_MS);
  let stdout = "";
  let stderr = "";
  const output = (): ChildOutput => ({ code: child.exitCode, signal: child.signalCode, stdout, stderr });
  const ended = new Promise<ChildOutput>((resolve) => {
    child.once("close", () => {
      clearTimeout(stuck);
      running.delete(child);
      resolve(output());
    });
  });
  const firstLine = new Promise<string>((resolve, reject) => {
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      const end = stdout.indexOf("\n");
      if (end !== -1) resolve(stdout.slice(0, end));
    });
    void ended.then((done) => reject(new Error(`The child ended (${howItEnded(done)}) before it printed a line:\n${done.stderr}`)));
  });
  // Not every caller waits for a first line.
  firstLine.catch(() => undefined);
  child.stderr.on("data", (data: Buffer) => void (stderr += data.toString()));
  const kill = (signal: NodeJS.Signals = "SIGTERM"): Promise<ChildOutput> => {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    return ended;
  };
  if (options.t !== undefined) {
    stopAfter(options.t, async () => {
      await kill("SIGKILL");
    });
  }
  return { pid: child.pid ?? 0, output, ended, kill, firstLine };
}

/**
 * Start `program`, which runs until it is stopped, as a process of its own, and
 * wait for the one JSON line it prints when it is ready. It is killed when the
 * test ends if it is still running.
 */
export async function startChild<Line = unknown>(t: TestContext, program: ChildProgram): Promise<Child<Line>> {
  const child = runChild(program, { t, untilStopped: true });
  const first = await child.firstLine;
  try {
    return { ...child, line: JSON.parse(first) as Line };
  } catch (error) {
    throw new Error(`The child printed a line that is not JSON: ${first}`, { cause: error });
  }
}
