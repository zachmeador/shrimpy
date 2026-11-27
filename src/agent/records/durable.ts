/**
 * Shrimpy's own documents, kept in the engine's storage and written in the same
 * commits as the work they belong to: what the agent's records are called,
 * which session is which and what each kept for its next input, where the agent
 * stands in chat's feed, the last valid definition of each standing trigger,
 * running background `bash` processes, and live watches on other agents.
 */
export type { SessionDefaults } from "./defaults.durable.ts";
export {
  copyOf,
  DOCUMENTS,
  FeedDoc,
  ProcessesDoc,
  type SessionRecord,
  sessionAddress,
  SessionsDoc,
  type StoredProcess,
  type StoredTrigger,
  TriggersDoc,
  WatchesDoc,
} from "./documents.durable.ts";
export {
  carrying,
  keepSkipped,
  keptPlace,
  learnPlace,
  takeBreadcrumbs,
  takeEvents,
  takeMissed,
} from "./kept.durable.ts";
export {
  ContextRevisionsDoc,
  InputFactsDoc,
  RequestDetailDoc,
  RequestsIndexDoc,
  type StoredHomeOmission,
  type StoredHookDelta,
  type StoredRequestDetail,
  type StoredRequestSummary,
  type StoredSectionRevision,
  type StoredSourceRevision,
} from "./request-docs.durable.ts";
export { openSession } from "./open-session.durable.ts";
export { openRecords } from "./records.durable.ts";
export { type SessionThread, threadOfSession } from "./thread-of.durable.ts";
