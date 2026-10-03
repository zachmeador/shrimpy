/**
 * Where a command prints and listens, so a test can stand in for the terminal
 * and for the signals that stop a process. It must not know what any command
 * says or does.
 */
export { type Io, processIo } from "./io.ts";
