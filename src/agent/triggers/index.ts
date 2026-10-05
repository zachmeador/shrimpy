/**
 * The agent's standing triggers. It makes each trigger follow the files of the
 * home, gives each one that is on a task that sleeps until its next occurrence is
 * due, makes the occurrence, which is an input of a session, and answers what the
 * agent's API asks about them: the list, one trigger with its recent occurrences,
 * and firing one now. It must not know how the files are read, how chat finds a
 * thread's channel, or how an occurrence's turn is run.
 */
export { createTriggers, type Triggers } from "./triggers.ts";
