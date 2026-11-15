/**
 * Test support that every program's tests share: stopping what a test started
 * when it ends, temporary directories, a runtime directory of its own (and
 * work run in another), waiting for something to happen, pauses between
 * attempts that count themselves, children run as processes of their own with
 * one set of ways to stop them, a terminal a test types into, a link between
 * two programs that goes quiet without closing, and a client that leaves before
 * it is answered. Node only.
 * Only tests and test fixtures import this, and it must not know about any
 * program.
 */
export { stopAfter, tempDir } from "./cleanup.ts";
export { type Child, type ChildOutput, type ChildProgram, type RunningChild, runChild, startChild } from "./child.ts";
export { leaveUnanswered } from "./gone.ts";
export { type QuietLink, startQuietLink } from "./link.ts";
export { type CountedBackoff, countedBackoff } from "./pauses.ts";
export { inRuntimeDir, useRuntimeDir } from "./runtime.ts";
export { runUntilStopped } from "./run-until-stopped.ts";
export { FakeTerminal } from "./terminal.ts";
export { eventually, settle, until, waitForView, type WaitOptions, within } from "./wait.ts";
