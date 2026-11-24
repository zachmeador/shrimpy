import { asError } from "../../lib/errors/index.ts";
import type { Io } from "../io/index.ts";
import { inOwnShell, type Reached, reachChat } from "../talk/index.ts";
import type { AtHome } from "./which-agent.ts";

/** What a check is of, for the sentence that says it was not made: "The room #ops", "which rooms it is in". */
export interface Unchecked {
  /** What is checked, to start a sentence. */
  what: string;
  /** What only the agent itself can say, to finish one. */
  only: string;
  /** What comes of it when the check would have failed, when that is worth saying. */
  otherwise?: string;
}

/**
 * Check what only the agent `target` names can say, by asking chat as that
 * agent, which a command can do only in the agent's own shell. Anywhere else,
 * or with chat out of reach, it says that the check was not made and why, and
 * gives undefined, for the command to carry on.
 */
export async function asTheAgent<T>(io: Io, target: AtHome, unchecked: Unchecked, check: (reached: Reached) => Promise<T> | T): Promise<T | undefined> {
  if (!inOwnShell(target.home)) {
    const otherwise = unchecked.otherwise === undefined ? "" : ` ${unchecked.otherwise}`;
    io.out(`${unchecked.what} was not checked, because only the agent itself can say ${unchecked.only}, and this command is not run by it.${otherwise}`);
    return undefined;
  }
  let reached: Reached;
  try {
    reached = await reachChat(io);
  } catch (error) {
    io.out(`${unchecked.what} was not checked, because chat could not be reached: ${asError(error).message}`);
    return undefined;
  }
  try {
    return await check(reached);
  } finally {
    await reached.close();
  }
}
