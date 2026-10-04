/**
 * An agent's home on disk: where its files live, what `agent.json` says, how
 * to create or load one, and what its instructions, context and skills files
 * tell the agent, read into a snapshot. It must not know about the engine, the
 * model runtime or how the agent is reached.
 */
export { type ModelChoice, modelLabel, parseModelChoice } from "./agent-config.ts";
export { type InitOptions, type InitResult, initHome } from "./init.ts";
export { type HomePaths, homePaths } from "./layout.ts";
export { type LoadedHome, loadHome } from "./load.ts";
export {
  type ContextFile,
  type HomeSnapshot,
  type LeftOut,
  readHomeSnapshot,
  type SkillTrail,
} from "./snapshot.ts";
