import type { TestContext } from "node:test";
import { type Child, type ChildOutput, type ChildProgram, startChild } from "./child.ts";

/**
 * A program that runs until it is stopped, in a process of its own, which a
 * test takes down and brings back: stopped, killed as a program that went
 * away, started again as one that came back, and frozen and thawed as one that
 * went dead and came to.
 */
export interface Restartable<Line> {
  /** What it printed when it last said it was ready. */
  readonly listening: Line;
  /** What the process it last ran as has printed, and how it ended once it has. */
  output(): ChildOutput;
  /** Ask it to stop, as SIGTERM does unless another signal is given, and wait until it has ended. */
  stop(signal?: NodeJS.Signals): Promise<ChildOutput>;
  /** Kill it, like a program that went away. What it kept stays in its data. */
  outage(): Promise<void>;
  /** Start it again, like a program that came back, running what `program` gives once it is known not to be running. */
  recover(program: () => ChildProgram): Promise<void>;
  /** Stop it without ending it, like a program that went dead: it takes what is sent and answers nothing. */
  freeze(): void;
  /** Let one that was frozen run again. */
  thaw(): void;
}

/**
 * Start `program` as a program a test takes down and brings back. `name` says
 * what it is, as "The gateway", when it is started again while it runs. It is
 * killed when the test ends if it is still running.
 */
export async function startRestartable<Line>(t: TestContext, name: string, program: ChildProgram): Promise<Restartable<Line>> {
  let last = await startChild<Line>(t, program);
  let running: Child<Line> | undefined = last;
  const stop = async (signal: NodeJS.Signals = "SIGTERM"): Promise<ChildOutput> => {
    const stopping = running;
    running = undefined;
    return stopping === undefined ? last.output() : stopping.kill(signal);
  };
  return {
    get listening() {
      return last.line;
    },
    output: () => last.output(),
    stop,
    async outage() {
      await stop("SIGKILL");
    },
    async recover(next) {
      if (running !== undefined) throw new Error(`${name} is running.`);
      last = await startChild<Line>(t, next());
      running = last;
    },
    freeze() {
      if (running !== undefined) process.kill(running.pid, "SIGSTOP");
    },
    thaw() {
      if (running !== undefined) process.kill(running.pid, "SIGCONT");
    },
  };
}
