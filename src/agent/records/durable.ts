/**
 * Shrimpy's own documents, kept in the engine's storage and written in the same
 * commits as the work they belong to: what the agent's records are called and
 * whether the agent is running, which session is which and what each kept for its
 * next input, where the agent stands in chat's feed, and the last valid
 * definition of each trigger. It also holds the changes to a session's record
 * that another module makes in its own commit: finding or making a session,
 * taking out what it kept, working out which breadcrumbs are new to it, and
 * keeping what an input that was skipped was to show. It opens the records at the start, giving them an ID of their own the
 * first time, and refuses a home whose documents another version wrote, saying
 * what to do. It must not know how an input is run, how chat or the files of a
 * home are read, or what a session shows a client.
 */
export { agentChange, type SessionDefaults } from "./defaults.durable.ts";
export {
  FeedDoc,
  plain,
  RecordsDoc,
  type SessionRecord,
  sessionAddress,
  SessionsDoc,
  type StoredTrigger,
  triggerSession,
  TriggersDoc,
} from "./documents.durable.ts";
export { carrying, keepCancelled, keepSkipped, takeBreadcrumbs, takeCancelled, takeEvents } from "./kept.durable.ts";
export { openSession } from "./open-session.durable.ts";
export { openRecords } from "./records.durable.ts";
export { placeOfSession, type SessionPlace, type SessionThread, threadOfSession } from "./thread-of.durable.ts";
