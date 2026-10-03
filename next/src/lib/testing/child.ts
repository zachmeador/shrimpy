import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { stopAfter } from "./cleanup.ts";

/** What to run in a child: a script file, or the source of a module. */
export type ChildProgram = { file: string | URL; args?: string[] } | { source: string };

export interface Child<Line> {
  readonly process: ChildProcess;
  readonly pid: number;
  /** The JSON line the child printed to say it was ready. */
  readonly line: Line;
  /** Stop the child with `signal` and wait until it has gone. Does nothing if it already has. */
  readonly kill: (signal?: NodeJS.Signals) => Promise<void>;
}

/**
 * Start `program` as a process of its own, and wait for the one JSON line it
 * prints when it is ready. It inherits the environment, including
 * SHRIMPY_RUNTIME_DIR. If it is still running when the test ends it is killed.
 */
export async function startChild<Line = unknown>(
  t: TestContext,
  program: ChildProgram,
): Promise<Child<Line>> {
  const argv =
    "source" in program
      ? ["--input-type=module", "-e", program.source]
      : [
          typeof program.file === "string" ? program.file : fileURLToPath(program.file),
          ...(program.args ?? []),
        ];
  const child = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "inherit"] });
  const kill = async (signal: NodeJS.Signals = "SIGTERM"): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill(signal);
    await once(child, "exit");
  };
  stopAfter(t, () => kill("SIGKILL"));
  const line = await firstLine(child);
  try {
    return { process: child, pid: child.pid ?? 0, line: JSON.parse(line) as Line, kill };
  } catch (error) {
    throw new Error(`The child printed a line that is not JSON: ${line}`, { cause: error });
  }
}

/**
 * The first line a child prints to standard output, without its line break.
 * Rejects if the child ends before it prints one.
 */
export function firstLine(child: ChildProcess): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = "";
    const ended = (code: number | null, signal: NodeJS.Signals | null): void => {
      reject(new Error(`The child ended (${String(code ?? signal)}) before it printed a line`));
    };
    child.once("close", ended);
    child.once("error", reject);
    const read = (chunk: Buffer): void => {
      output += chunk.toString();
      const end = output.indexOf("\n");
      if (end === -1) return;
      child.off("close", ended);
      child.off("error", reject);
      child.stdout?.off("data", read);
      // Whatever it prints from here on is not wanted, but it must not fill the pipe.
      child.stdout?.resume();
      resolve(output.slice(0, end));
    };
    child.stdout?.on("data", read);
  });
}
