/**
 * The agent's sessions as clients see them: one for each thread it takes part
 * in, addressed by the thread's ID, and one of its own for each trigger whose
 * occurrences go to no thread. It says which there are, where each is and whether
 * a turn is underway in it, kept live from the engine's commits; turns the
 * engine's view of a session into the contract's window and status, kept live as
 * the engine shows each change, a partial answer included, and pages back through
 * a session's history; says which models the agent can use and refuses one it
 * can't; makes the sessions follow the home's model and working directory; and
 * takes a client's steer, wait and stop to the engine. A stop ends the turn that
 * is running, takes back the inputs that wait, cancels the wake-ups the session is
 * waiting on and closes the questions it asked other agents, and it is what a
 * person's `/stop` in a thread does too, through the function this exports. It
 * must not know how an input is taken up, followed or told to its source, who may
 * ask, or how a client reaches the agent.
 */
export { requireModel } from "./models.durable.ts";
export { stopWork } from "./service.durable.ts";
export { createSessions, type HomeModel, noSessionYet, type Sessions, shownOf } from "./sessions.durable.ts";
