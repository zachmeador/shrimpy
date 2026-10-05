/**
 * Test support for the message tools: the real chat server with Zach's DM with
 * the agent Scout, a live connection to it, and a way to run a tool the way the
 * engine does, with an ID for the call and the session it runs in. Only tests
 * import this, and it must not know the engine beyond what a tool is handed.
 */
export { startToolRig, type ToolRig, type ToolRigOptions, type ToolRun } from "./rig.ts";
