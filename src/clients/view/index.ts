/**
 * What a client shows, as plain text and facts, a level at a time: for the
 * state it is given, the agents and rooms, what the open one takes part in,
 * the open thread with every agent's work and wake-ups in it, and the session
 * on show; what is not working, what can be written after a slash and what
 * comes of it, and every sentence a client says but those that name its keys
 * or gestures, which are its own. Each client decides which levels it shows at
 * once, and how. Everything that came from another member, an agent or a tool
 * passes through here made harmless for a terminal, so nothing downstream has
 * to trust it. It must not know how anything is drawn, or reach the network.
 */
export { type AgentsLevel, agentsLevel } from "./agents.ts";
export { type CommandLine, type ModelLine, modelLines, writtenIn } from "./commands.ts";
export { BRIEF, type LevelOptions, type Row } from "./level.ts";
export { type ListLevel, listLevel, type ListOptions } from "./list.ts";
export { sessionLevel, type SessionLevel, type SessionOptions } from "./session.ts";
export { type AgentWork, type MessageRow, type StatusBlock, threadLevel, type ThreadLevel, type ThreadOptions, type Waiting } from "./thread.ts";
export type { Step, Work } from "./work.ts";
export { farewellLine, hiddenLines, type InFull, type ListFilter, MODEL_DEFAULT, OUT_OF_DATE, READ_ONLY_TAG } from "./words.ts";
