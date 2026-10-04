/**
 * Test support for intake: the agent's sessions and records as a test scripts
 * them, and an intake wired to the real chat server with a person to talk to
 * it. Only tests and test fixtures import this, and it must not know the engine.
 */
export { SCOUT } from "../../testing/index.ts";
export { type Faults, type IntakeRig, type IntakeRigOptions, startIntakeRig } from "./rig.ts";
export { type ScriptedTurns, scriptedTurns } from "./turns.ts";
