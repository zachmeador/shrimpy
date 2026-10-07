/**
 * The gateway's ways in: one Unix socket for each program that is registered,
 * which the gateway pipes to the program: to its own socket, or for an agent
 * apart from the gateway to the connection the agent opens when it is called.
 * A client reaches a program by its name through its way in, on this machine as
 * on any other, and never learns the program's socket. It must not know what
 * the bytes it pipes mean, who sent them, or how a program is reached.
 */
export { createWays, type Ways, type WaysOptions } from "./ways.ts";
