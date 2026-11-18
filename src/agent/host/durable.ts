/**
 * The owner of a home: takes the home's lock, then opens its storage and
 * engine, refusing storage written before the move to Pi 1.5.2, and builds the
 * model runtime from the home's files and the folder's. It reads the engine's
 * tasks of a kind, ends a session's, has what a task ends with when it is done
 * or aborted, and ends one that failed, for the modules that keep tasks there,
 * and says what a tool answers and what names a request a tool call makes.
 * It also signs the folder in to a model provider, through Pi's own flows under
 * Shrimpy's name, with whoever runs it asked through a dialogue. Nothing else in Shrimpy opens a
 * home's storage. It must not know about clients, chat or how the agent is
 * reached, or what a person's terminal looks like.
 */
export { type Host, type HostOptions, openHost } from "./host.durable.ts";
export { buildModels, type ModelReload, type ModelRuntimeOptions, ModelSetupError } from "./models.durable.ts";
export {
  type Dialogue,
  type Notice,
  openSignIns,
  type ProviderToSignIn,
  type Question,
  type SignIns,
  type SignInWay,
  type WayToSignIn,
} from "./sign-in.ts";
export { ABORTED, COMPLETED, endTasks, failTask, type TaskScanner, tasksOfKind } from "./tasks.durable.ts";
export { answer, failure, toolRequestId } from "./tools.durable.ts";
