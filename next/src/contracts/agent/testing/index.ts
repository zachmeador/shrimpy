/**
 * Test support for the agent contract: a stand-in for an agent's API, with
 * sessions scripted in memory and served over a real socket, for tests of
 * whatever watches and stops an agent's sessions. It answers as an agent does
 * but holds no code of it. Only tests and test fixtures import this, and it must
 * not know about any program.
 */
export { type ScriptedAgent, type ScriptedSession, scriptedAgent } from "./scripted.ts";
export { type StandInAgent, type StandInAgentOptions, startStandInAgent } from "./stand-in.ts";
export { assistantItem, sessionView, toolItem, userItem, workingView } from "./views.ts";
