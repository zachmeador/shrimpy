/**
 * Test support that every program's tests share: stopping what a test started
 * when it ends, temporary directories, a runtime directory of its own (and
 * work run in another), waiting for something to happen, pauses between
 * attempts that count themselves, children run as processes of their own with
 * one set of ways to stop them, a program a test takes down and brings back,
 * and a terminal a test types into. Node only.
 * Only tests and test fixtures import this, and it must not know about any
 * program.
 */
export { stopAfter, tempDir } from "./cleanup.ts";
export { type Child, type ChildOutput, type ChildProgram, runChild, startChild } from "./child.ts";
export { countedBackoff } from "./pauses.ts";
export { type Restartable, startRestartable } from "./restartable.ts";
export { inRuntimeDir, useRuntimeDir } from "./runtime.ts";
export { runUntilStopped } from "./run-until-stopped.ts";
export { FakeTerminal } from "./terminal.ts";
export { eventually, until, waitForView, within } from "./wait.ts";
