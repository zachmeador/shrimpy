/**
 * The owner of a home: takes the home's lock, then opens its storage and
 * engine, and builds the model runtime from the home's files and the folder's.
 * Nothing else in Shrimpy opens a home's storage. It must not know about
 * clients, chat or how the agent is reached.
 */
export { type Host, type HostOptions, openHost } from "./host.durable.ts";
export { buildModels, type ModelRuntimeOptions, ModelSetupError } from "./models.durable.ts";
export { HomeOwnedError, takeOwnerLock } from "./owner-lock.ts";
