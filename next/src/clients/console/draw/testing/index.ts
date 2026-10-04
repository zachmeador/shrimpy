/**
 * Test support for the drawing: a terminal that takes what is written to it
 * and hears what a test types, and the lines of a drawing as a person reads
 * them. Only tests and test fixtures import this, and it must not know what the
 * console shows or does.
 */
export { FakeTerminal, visible } from "./terminal.ts";
