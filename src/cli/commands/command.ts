import type { Io } from "../io/index.ts";

/** One `shrimpy` command: what it is called, how it is used, and what it does. */
export interface Command {
  /** The words that select it, such as "agent serve" or "run". The first word is its family's. */
  readonly name: string;
  /** The arguments after the name, such as "<agent> [--now]". */
  readonly usage: string;
  /** One line, for the list of commands. */
  readonly summary: string;
  /** More, for the command's own help. */
  readonly details?: string;
  /** Run with the arguments after the name. The result is the exit code. */
  run(args: string[], io: Io): Promise<number>;
}
