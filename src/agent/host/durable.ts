/**
 * The owner of a home: takes the home's lock, then opens its storage and
 * engine, and builds the model runtime from the home's files and the folder's.
 * It also signs the folder in to a model provider, through Pi's own flows, with
 * whoever runs it asked through a dialogue. Nothing else in Shrimpy opens a
 * home's storage. It must not know about clients, chat or how the agent is
 * reached, or what a person's terminal looks like.
 */
export { type Host, type HostOptions, openHost } from "./host.durable.ts";
export { buildModels, type ModelRuntimeOptions, ModelSetupError } from "./models.durable.ts";
export { HomeOwnedError, takeOwnerLock } from "./owner-lock.ts";
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
