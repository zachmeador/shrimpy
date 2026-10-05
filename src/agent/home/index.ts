/**
 * An agent's home on disk: where its files live, what `agent.json` says, how
 * to create or load one, what its instructions, context and skills files tell
 * the agent, read into a snapshot together with the skills that ship with
 * Shrimpy, what its triggers files say: when each fires, and what it is to do,
 * and what its wake file says about what wakes it in each room. Reading and
 * checking a trigger needs no running agent, so whatever writes a trigger checks
 * it the way the agent does, and this module is the one that writes, changes
 * and deletes the files of triggers, and writes the wake file. It must not know
 * about the engine, the model runtime or how the agent is reached.
 */
export { checkAgentName, type ModelChoice, modelLabel, parseModelChoice } from "./agent-config.ts";
export type { LeftOut } from "./files.ts";
export { type InitOptions, type InitResult, initHome } from "./init.ts";
export { type HomePaths, homePaths } from "./layout.ts";
export { type LoadedHome, loadHome } from "./load.ts";
export { describeSchedule, nextOccurrence, sameSchedule } from "./schedule.ts";
export { type ContextFile, type HomeSnapshot, readHomeSnapshot } from "./snapshot.ts";
export type { SkillTrail } from "./skills.ts";
export {
  draftTrigger,
  NoTriggerError,
  type NewTrigger,
  removeTrigger,
  saveTrigger,
  switchTrigger,
  type TriggerDraft,
} from "./trigger-files.ts";
export {
  DEFAULT_WAKE_POLICY,
  isWakePolicy,
  parseWake,
  readWake,
  saveWake,
  WAKE_POLICIES,
  type WakePolicy,
  type WakeRead,
  type WakeSettings,
} from "./wake.ts";
export {
  parseTrigger,
  readTriggers,
  type TriggerCheck,
  type TriggerDefinition,
  TriggerFileError,
  type TriggerFiles,
  type TriggerProblem,
} from "./triggers.ts";
