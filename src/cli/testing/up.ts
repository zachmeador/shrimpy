import { execFile } from "node:child_process";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { type ChildOutput, runChild, stopAfter, useRuntimeDir, within } from "../../lib/testing/index.ts";
import type { Pace } from "../commands/index.ts";
import type { LaunchOptions, RunningCommand } from "./process.ts";

const main = fileURLToPath(new URL("../main.ts", import.meta.url));
const paced = fileURLToPath(new URL("./up-child.ts", import.meta.url));

/** Whether a process with this ID is running. */
export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A process as the process table lists it. */
interface Listed {
  pid: number;
  parent: number;
  command: string;
}

/** Every process running now, from the process table. Fails when the table can't be read, or does not list this process. */
async function processTable(): Promise<Listed[]> {
  const { stdout } = await promisify(execFile)("ps", ["-A", "-ww", "-o", "pid=,ppid=,args="]);
  const listed = stdout.split("\n").flatMap((line) => {
    const found = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line);
    return found === null ? [] : [{ pid: Number(found[1]), parent: Number(found[2]), command: found[3] ?? "" }];
  });
  if (!listed.some((each) => each.pid === process.pid)) throw new Error("The process table does not list this process, so it was not read.");
  return listed;
}

/** The processes `pid` started that run now, the ones they started, and so on. */
function descendants(table: Listed[], pid: number): Listed[] {
  const found: Listed[] = [];
  let parents = new Set([pid]);
  while (parents.size > 0) {
    const children = table.filter((each) => parents.has(each.parent));
    found.push(...children);
    parents = new Set(children.map((each) => each.pid));
  }
  return found;
}

/** A program `up` runs: the gateway, the chat server, or an agent at its home. */
export interface UpProgram {
  readonly pid: number;
  readonly kind: "gateway" | "chat" | "agent";
  /** An agent's home, as `up` gave it to `agent serve`. */
  readonly home?: string;
}

/**
 * What a process `up` started serves, from its command line: `up` runs each
 * program as `gateway serve`, `chat serve` or `agent serve <home>` does.
 */
function programOf({ pid, command }: Listed): UpProgram | undefined {
  const words = command.split(" ");
  const at = words.findIndex((word, index) => word === "serve" && ["gateway", "chat", "agent"].includes(words[index - 1] ?? ""));
  if (at === -1) return undefined;
  const kind = words[at - 1] as UpProgram["kind"];
  return kind === "agent" ? { pid, kind, home: words[at + 1] } : { pid, kind };
}

/** `shrimpy up`, running as a process of its own. */
export interface RunningUp extends RunningCommand {
  /** The programs it runs now: the processes it started that serve one, as the process table lists them. */
  programs(): Promise<UpProgram[]>;
  /** What `work` resolves with, or a failure that says how `up` ended and what it printed, if it ends first. */
  until<T>(work: Promise<T>): Promise<T>;
}

/**
 * Start `shrimpy up` with `args` as its own process, and return at once: with
 * the times of `pace` when it is given, which the command takes from nothing a
 * test can set. It gets the test's runtime directory, unless `options.env`
 * names another, as a second place for agents to live in does.
 *
 * When the test ends it is stopped as a SIGTERM stops it, and killed if it does
 * not end. Whatever it was seen to run that still runs then is killed too,
 * however it ended: what it runs is read from the process table while it runs,
 * never from what it prints.
 */
export function launchUp(t: TestContext, args: string[], options: LaunchOptions & { pace?: Pace } = {}): RunningUp {
  useRuntimeDir(t);
  const program =
    options.pace === undefined
      ? { file: main, args: ["up", ...args], env: options.env }
      : { file: paced, args: [JSON.stringify(options.pace), ...args], env: options.env };
  const child = runChild(program, { t, untilStopped: true });
  const ended = (): boolean => child.output().code !== null || child.output().signal !== null;

  // Every process up was seen to run, by its ID and command line, so that what outlives up is found and only that.
  const seen = new Map<number, string>();
  const look = async (): Promise<Listed[]> => {
    const table = await processTable();
    for (const each of descendants(table, child.pid)) seen.set(each.pid, each.command);
    return table;
  };
  const watching = setInterval(() => void look().catch(() => undefined), 500);
  watching.unref();
  void child.ended.then(() => clearInterval(watching));

  stopAfter(t, async () => {
    clearInterval(watching);
    if (!ended()) await look();
    const stopped = await within(30_000, child.kill("SIGTERM"), "up stopping").catch(() => undefined);
    if (stopped === undefined) {
      await look();
      await child.kill("SIGKILL");
    }
    for (const each of await processTable()) {
      if (seen.get(each.pid) !== each.command) continue;
      try {
        process.kill(each.pid, "SIGKILL");
      } catch {
        // It ended since the table was read.
      }
    }
  });

  return {
    pid: child.pid,
    kill: (signal) => void child.kill(signal),
    output: child.output,
    finished: child.ended,
    async programs() {
      const table = await look();
      return table.filter((each) => each.parent === child.pid).flatMap((each) => programOf(each) ?? []);
    },
    until: <T>(work: Promise<T>): Promise<T> =>
      Promise.race([
        work,
        child.ended.then((done: ChildOutput): never => {
          throw new Error(`up ended (${String(done.code ?? done.signal)}) first:\n${done.stdout}\n${done.stderr}`);
        }),
      ]),
  };
}
