/**
 * Programs as processes of their own: start a `shrimpy` command that serves
 * one, wait for the line it prints when it is listening, hear what else it
 * prints, tell when it has ended, and stop it. It also says how to run this
 * same `shrimpy`. It must not know which programs there are, what they print
 * or in what order they should be stopped.
 */
export {
  describeEnd,
  type Ended,
  type Program,
  ProgramEndedError,
  type Say,
  shrimpyCommand,
  startProgram,
} from "./program.ts";
