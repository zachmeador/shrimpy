import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

/** The entry point of the CLI, which every program is started through. */
const main = fileURLToPath(new URL("../main.ts", import.meta.url));

/**
 * The program and arguments that run this same `shrimpy`: the node that is
 * running it, and its entry point. A shell with no `shrimpy` on its PATH can
 * run this, and so does every program this command starts.
 */
export function shrimpyCommand(): string[] {
  return [process.execPath, main];
}

/** The programs still running, so that a process that ends without stopping them takes them down. */
const running = new Set<ChildProcess>();
process.once("exit", () => {
  for (const child of running) child.kill("SIGTERM");
});

/** How a process ended: with an exit code, or by a signal. */
export interface Ended {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export function describeEnd(ended: Ended): string {
  return ended.signal === null ? `exit code ${String(ended.code)}` : `signal ${ended.signal}`;
}

/** The program ended before it said it was listening. */
export class ProgramEndedError extends Error {
  readonly ended: Ended;

  constructor(ended: Ended) {
    super(`The program ended (${describeEnd(ended)}) before it said it was listening.`);
    this.name = "ProgramEndedError";
    this.ended = ended;
  }
}

/** A program running as a process of its own. */
export interface Program<Listening> {
  readonly pid: number;
  /** What it printed to say it was listening: its first line of standard output, which is JSON. */
  readonly listening: Listening;
  /** Settles when the process has ended and everything it printed has been passed on. */
  readonly ended: Promise<Ended>;
  /** Ask it to stop, as SIGTERM does, and wait until it has ended. */
  stop(): Promise<Ended>;
  /** Send it a signal. Does nothing once it has ended. */
  signal(signal: NodeJS.Signals): void;
}

/** Told each line a program prints other than the one that says it is listening. */
export type Say = (stream: "out" | "err", line: string) => void;

/**
 * Run `shrimpy` with `args`, which serve a program, as a process of its own and
 * wait until it says it is listening. It keeps its own lock, socket and crash
 * boundary, which is why it is a process and not a call. It runs in a process
 * group of its own, so the Ctrl+C that stops the command that started it does
 * not reach it: that command stops it, in the order it chooses.
 */
export async function startProgram<Listening>(args: string[], say: Say): Promise<Program<Listening>> {
  const [node = process.execPath, ...entry] = shrimpyCommand();
  const child = spawn(node, [...entry, ...args], { stdio: ["ignore", "pipe", "pipe"], detached: true });
  running.add(child);
  const ended = once(child, "close").then(([code, signal]): Ended => {
    running.delete(child);
    return { code: code as number | null, signal: signal as NodeJS.Signals | null };
  });
  createInterface({ input: child.stderr }).on("line", (line) => say("err", line));

  const listening = await new Promise<Listening>((resolve, reject) => {
    let waiting = true;
    createInterface({ input: child.stdout }).on("line", (line) => {
      if (!waiting) return say("out", line);
      waiting = false;
      try {
        resolve(JSON.parse(line) as Listening);
      } catch (error) {
        child.kill("SIGTERM");
        reject(new Error(`The program printed something that is not JSON when it should say it is listening: ${line}`, { cause: error }));
      }
    });
    child.once("error", reject);
    void ended.then((how) => reject(new ProgramEndedError(how)));
  });

  return {
    pid: child.pid ?? 0,
    listening,
    ended,
    stop() {
      child.kill("SIGTERM");
      return ended;
    },
    signal: (signal) => void child.kill(signal),
  };
}
