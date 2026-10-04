/**
 * An agent's home on disk: where its files live, what `agent.json` says, how
 * to create or load one, and what its instructions, context and skills files
 * tell the agent, read into a snapshot together with the skills that ship with
 * Shrimpy. It must not know about the engine, the model runtime or how the
 * agent is reached.
 */
export { type ModelChoice, modelLabel, parseModelChoice } from "./agent-config.ts";
export type { LeftOut } from "./files.ts";
export { type InitOptions, type InitResult, initHome } from "./init.ts";
export { type HomePaths, homePaths } from "./layout.ts";
export { type LoadedHome, loadHome } from "./load.ts";
export { type ContextFile, type HomeSnapshot, readHomeSnapshot } from "./snapshot.ts";
export type { SkillTrail } from "./skills.ts";
