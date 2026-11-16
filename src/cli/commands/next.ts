import type { Io } from "../io/index.ts";

/** A line under a step of what to do next: more to say, or a command to run, which is set in further. */
export type StepLine = string | { run: string };

/** One step of what to do next: what to do, then the lines under it. */
export type Step = readonly [string, ...StepLine[]];

/** Print what to do next, as numbered steps. */
export function printNext(io: Io, steps: readonly Step[]): void {
  io.out("");
  io.out("Next:");
  steps.forEach(([first, ...rest], index) => {
    io.out(`  ${index + 1}. ${first}`);
    for (const line of rest) io.out(typeof line === "string" ? `     ${line}` : `       ${line.run}`);
  });
}
