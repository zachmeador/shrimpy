/**
 * The agent's sessions as clients see them: one for each thread it takes part
 * in, addressed by the thread's ID, and one of its own for each trigger whose
 * occurrences go to no thread. It says which there are and whether each is
 * working, makes them follow the home's model and working directory, turns the
 * engine's records of a session into the contract's session view and keeps it
 * published, and takes a client's steer, wait and stop to the engine. A stop ends
 * the turn that is running, takes back the inputs that wait and cancels the
 * wake-ups the session is waiting on, and it is what a person's `/stop` in a
 * thread does too, through the function this exports. It must not know how an
 * input is taken up, followed or told to its source, or about transports and
 * chat.
 */
export { type ServedSession, stopWork } from "./service.durable.ts";
export { createSessions, type Sessions } from "./sessions.durable.ts";
