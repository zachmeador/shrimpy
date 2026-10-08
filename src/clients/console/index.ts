/**
 * The terminal client: browse the agents on the Shrimpy network and the rooms
 * you are in, see your threads with an agent or the threads of a room, talk in a
 * thread, with `/status` to read how the agent or the room stands and `/model`
 * to try another model in a thread with an agent, watch an agent's work behind
 * it, and see an agent's sessions, whatever they are behind, and watch any of
 * them. It makes no room and adds no member. It is a
 * client of the chat server and of agents, reaching both by their names through
 * the gateway over transports it is handed, and it never opens a home, a store
 * or a program's files. Only the command line imports this, to open it. It must
 * not know how a program works inside.
 */
export { type ConsoleIo, type ConsoleOptions, openConsole } from "./console.ts";
export type { ConsoleTerminal } from "./draw/index.ts";
