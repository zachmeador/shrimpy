/**
 * The `shrimpy` command. It creates agents, starts the programs, either through
 * each program's front door or as processes of their own, and talks to running
 * ones through their contracts, as a person does in chat. It alone knows the
 * Shrimpy folder where a person's setup lives by default: the programs take
 * explicit paths. It must not open a home's or the chat server's storage, or
 * know how a program works inside.
 */
export { type Io, processIo } from "./io/index.ts";
export { runCli } from "./run.ts";
