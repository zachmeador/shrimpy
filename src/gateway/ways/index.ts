/**
 * The gateway's ways in: one Unix socket for each program that is registered,
 * which the gateway pipes to the program's own socket. A client reaches a
 * program by its name through its way in, on this machine as on any other, and
 * never learns the program's socket. It must not know what the bytes it pipes
 * mean, or who sent them.
 */
export { createWays, type Ways, type WaysOptions } from "./ways.ts";
