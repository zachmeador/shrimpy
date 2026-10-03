/**
 * Test support that every program's tests share: stopping what a test started
 * when it ends, temporary directories, a runtime directory of its own,
 * waiting for something to happen, and child processes to signal. Node only.
 * Only tests and test fixtures import this, and it must not know about any
 * program.
 */
export { stopAfter, tempDir } from "./cleanup.ts";
export { type Child, type ChildProgram, startChild } from "./child.ts";
export { useRuntimeDir } from "./runtime.ts";
export { runUntilStopped } from "./run-until-stopped.ts";
export { eventually, settle, until, waitForView, type WaitOptions } from "./wait.ts";
