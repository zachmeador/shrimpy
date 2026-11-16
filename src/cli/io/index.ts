/**
 * Where a command prints, listens and asks, so a test can stand in for the
 * terminal and for the signals that stop a process, with what it prints for a
 * person made harmless for a terminal. It must not know what any command says
 * or does.
 */
export { forPeople, type Io, processIo } from "./io.ts";
