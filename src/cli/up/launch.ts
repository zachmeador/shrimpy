import type { Address } from "../../contracts/gateway/index.ts";
import type { Io } from "../io/index.ts";
import { describeEnd, type Program, ProgramEndedError, startProgram } from "../programs/index.ts";

/** The line a program prints to say it is listening, as far as `up` reads it. */
export interface Listening {
  pid: number;
  name?: string;
  /** The gateway's: the addresses it listens on for agents apart from it, and the file it read them from when it was given none. */
  listen?: Address[];
  listenKept?: string | null;
  /** The gateway's: where a browser opens the web client's page. */
  page?: string | null;
}

/** A program `up` started. */
export interface Started {
  role: "gateway" | "chat" | "agent";
  /** What to call it in a sentence: "the chat server". */
  what: string;
  program: Program<Listening>;
  /** It ended without being asked to, which is why everything is being stopped. */
  endedByItself?: true;
  /** When an agent started, in milliseconds since the epoch. */
  startedAt?: number;
}

/** Lines a program printed before it said it was listening, in the order it printed them. */
export type Held = { stream: "out" | "err"; line: string }[];

/**
 * Start a program, passing on what it prints with its label in front, so that
 * the lines of different programs can be told apart. The label can be changed
 * while the program runs. What it prints before it says it is listening is kept
 * in `held` when that is given, and printed once it has: if it ends instead, the
 * caller says what became of it.
 */
export async function launch(
  io: Io,
  label: { text: string },
  what: string,
  args: string[],
  held?: Held,
): Promise<Program<Listening>> {
  const show = (stream: "out" | "err", line: string): void => io[stream](`[${label.text}] ${line}`);
  let holding = held !== undefined;
  try {
    const program = await startProgram<Listening>(args, (stream, line) => {
      if (holding) held?.push({ stream, line });
      else show(stream, line);
    });
    holding = false;
    for (const { stream, line } of held ?? []) show(stream, line);
    return program;
  } catch (error) {
    if (error instanceof ProgramEndedError) {
      throw new Error(`Could not start ${what} (${describeEnd(error.ended)}).`, { cause: error });
    }
    throw error;
  }
}

/** `text` to start a sentence with: "The chat server". */
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
