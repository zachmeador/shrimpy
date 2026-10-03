/**
 * An agent's home on disk: where its files live, what `agent.json` says, and
 * how to create or load one. It must not know about the engine, the model
 * runtime or how the agent is reached.
 */
export { type AgentConfig, type ModelChoice, modelLabel, parseModelChoice } from "./agent-config.ts";
export { type InitOptions, type InitResult, initHome } from "./init.ts";
export { type HomePaths, homePaths } from "./layout.ts";
export { type LoadedHome, loadHome } from "./load.ts";
