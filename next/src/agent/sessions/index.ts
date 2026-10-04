/**
 * The agent's sessions, one for each thread it takes part in, addressed by the
 * thread's ID. This is the one place that touches the engine's records: it
 * turns them into the contract's session view, runs the sessions, and writes
 * Shrimpy's own documents (which thread a session belongs to, the outbox, the
 * feed cursor) in the same commits as the work they belong to. It must not
 * know about transports, or about chat beyond the messages it is handed.
 */
export type { SessionDefaults } from "./defaults.ts";
export type { ServedSession } from "./service.ts";
export { createSessions, type Sessions } from "./sessions.ts";
