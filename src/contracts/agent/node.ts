/**
 * The Node-only door of the agent contract: linking straight to the agent of a
 * home by the home's path, on its own socket, and reading and keeping the
 * membership the home holds. It also has the rest of a home's files that the
 * agent and the `shrimpy` command share: where they are, making and loading a
 * home, the wake file, the trigger files and their schedules, and how a home's
 * files are read and written whole, so that a reader never sees half of one;
 * and the `providers/` directory of the folder agents are started in, with its
 * default model. Browser code must not import this file.
 */
export { AgentNotRunningError, connectHome, type ConnectHomeOptions, type HomeClient, readEndpoint } from "./connect.node.ts";
export { readDefaultModel, saveDefaultModel } from "./default-model.node.ts";
export { codeOf, compare, type LeftOut, readText, replaceFile, why } from "./files.node.ts";
export { type InitOptions, type InitResult, initHome } from "./init.node.ts";
export { type HomePaths, homePaths, type ProviderPaths, providerPaths } from "./layout.node.ts";
export { type LoadedHome, loadHome } from "./load.node.ts";
export { readMembership, saveMembership } from "./membership.node.ts";
export { nextOccurrence } from "./schedule.node.ts";
export {
  draftTrigger,
  type NewTrigger,
  NoTriggerError,
  removeTrigger,
  saveTrigger,
  switchTrigger,
  type TriggerDraft,
} from "./trigger-files.node.ts";
export {
  parseTrigger,
  readTriggers,
  type TriggerDefinition,
  TriggerFileError,
  type TriggerFiles,
  type TriggerProblem,
} from "./triggers.node.ts";
export { readWake, saveWake, type WakeRead } from "./wake.node.ts";
