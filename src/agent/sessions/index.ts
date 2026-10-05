/**
 * The agent's sessions: one for each thread it takes part in, addressed by the
 * thread's ID, and one of its own for each trigger whose occurrences go to no
 * thread. This is the one place that touches the engine's records: it turns
 * them into the contract's session view, runs the sessions, and writes
 * Shrimpy's own documents (which session is which, the feed cursor, the last
 * valid definition of each trigger) in the same commits as the work they belong
 * to. It owns the task that follows each input the agent takes up, from a chat
 * event, a wake-up it asked for or an occurrence of a trigger, until the
 * input's source is told how its turn ended; the task that waits for a wake-up
 * to come due; and the task that waits for each trigger's next occurrence and
 * makes it. It answers what chat asks about those tasks, and what the agent's
 * API asks about the triggers, and stops the work of a thread's session when
 * chat is told to by a command, as it does for a client's stop. It opens the
 * records at the start, giving them an ID of their own the first time, and
 * refuses, saying what to do, a home whose documents another version wrote. It
 * notes in them that the agent is running until an orderly stop, and counts the
 * crashes that the turns it interrupted live through. It must not know about
 * transports, or about chat beyond the messages it is handed.
 */
export type { Run } from "./crashes.ts";
export type { SessionDefaults } from "./defaults.ts";
export { openRecords } from "./records.ts";
export type { ServedSession } from "./service.ts";
export { createSessions, type Sessions } from "./sessions.ts";
export { type SessionThread, threadOfSession } from "./thread-of.ts";
export { createTriggers, type Triggers } from "./triggers.ts";
export { type TurnTask, type TurnTaskOptions, turnTask } from "./turn-task.ts";
export { createWakeups, type Wakeups } from "./wakeups.ts";
