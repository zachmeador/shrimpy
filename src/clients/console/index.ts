/**
 * The terminal client: browse the agents on the Shrimpy network, see your
 * threads with them, talk in a thread, watch the work behind it and stop it. It
 * is a client of the chat server and of agents, reaching both by their names
 * through the gateway over transports it is handed, and it never opens a home,
 * a store or a program's files. Only the command line imports this, to open it.
 * It must not know how a program works inside.
 */
export { type ConsoleIo, type ConsoleOptions, openConsole } from "./console.ts";
export type { ConsoleTerminal } from "./draw/index.ts";
