/**
 * Test support that every program's tests share: stopping what a test started
 * when it ends, temporary directories, a runtime directory of its own (and
 * work run in another), waiting for something to happen, child processes to
 * signal, a stand-in for a program to connect to, a server that stops
 * answering, and a client that leaves before it is answered. Node only.
 * Only tests and test fixtures import this, and it must not know about any
 * program.
 */
export { stopAfter, tempDir } from "./cleanup.ts";
export { type Child, type ChildProgram, firstLine, startChild } from "./child.ts";
export { type Freezable, freezable } from "./frozen.ts";
export { leaveUnanswered } from "./gone.ts";
export { inRuntimeDir, useRuntimeDir } from "./runtime.ts";
export { runUntilStopped } from "./run-until-stopped.ts";
export { offer, type Offer, type StandIn, type StandInOptions, startStandIn } from "./stand-in.ts";
export { eventually, settle, until, waitForView, type WaitOptions, within } from "./wait.ts";
