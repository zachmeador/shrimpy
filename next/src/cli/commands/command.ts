import type { Io } from "../io.ts";

/** One `shrimpy` command: what it is called, how it is used, and what it does. */
export interface Command {
  /** The words that select it, such as "agent serve". */
  readonly name: string;
  /** The arguments after the name, such as "<home> [--now]". */
  readonly usage: string;
  readonly summary: string;
  /** Run with the arguments after the name. The result is the exit code. */
  run(args: string[], io: Io): Promise<number>;
}
