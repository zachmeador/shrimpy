/**
 * The `shrimpy` command. It creates and starts agents, the gateway and the chat
 * server through each program's front door, and talks to running ones through
 * their contracts. It must not open a home's or the chat server's storage, or
 * know how a program works inside.
 */
export { type Io, processIo } from "./io/index.ts";
export { runCli } from "./run.ts";
