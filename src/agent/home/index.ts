/**
 * An agent's home on disk: where its files live, and the files of the
 * `providers/` directory it may be told of, what `agent.json` says, how
 * to create or load one, what its instructions, context and skills files tell
 * the agent, read into a snapshot together with the skills that ship with
 * Shrimpy, which goes on with what an earlier reading had of a file the next one
 * leaves out, what its triggers files say: when each fires, what it is to do and
 * whether a check decides there is anything to do, what its breadcrumbs folder
 * holds, and what its wake file says about what wakes it in each room. Reading
 * and checking a trigger needs no running agent, so whatever writes a trigger
 * checks it the way the agent does, and this module is the one that writes,
 * changes and deletes the files of triggers, writes and deletes the breadcrumbs
 * the agent and a trigger leave, and writes the wake file. It also looks at the
 * files an agent reads, by their names, sizes, modes and times and never their
 * contents, so the agent can tell when to read them again. It must not know
 * about the engine, the model runtime or how the agent is reached.
 */
export { checkAgentName, type ModelChoice, modelLabel, parseModelChoice } from "./agent-config.ts";
export { type BreadcrumbFile, readBreadcrumbs, removeBreadcrumb, writeBreadcrumb } from "./breadcrumbs.ts";
export { readDefaultModel, saveDefaultModel } from "./default-model.ts";
export { cutText, type LeftOut, leftOutSentence, shownIn } from "./files.ts";
export { type InitOptions, type InitResult, initHome } from "./init.ts";
export { type HomePaths, homePaths, type ProviderPaths, providerPaths } from "./layout.ts";
export { type LoadedHome, loadHome } from "./load.ts";
export { lookAtHome } from "./look.ts";
export { delayMs, delayText, describeSchedule, nextOccurrence, normalizeDelay, sameSchedule } from "./schedule.ts";
export { carryOver, type ContextFile, type HomeSnapshot, readHomeSnapshot } from "./snapshot.ts";
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
