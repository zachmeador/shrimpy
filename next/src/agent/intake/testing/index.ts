/**
 * Test support for intake: the agent's sessions and records as a test scripts
 * them, and an intake wired to a scripted chat with a person to talk to it.
 * Only tests and test fixtures import this, and it must not know the engine.
 */
export { type IntakeRig, type IntakeRigOptions, scout, startIntakeRig, zach } from "./rig.ts";
export { type ScriptedTurns, scriptedTurns } from "./turns.ts";
