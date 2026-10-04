/**
 * What arrives from chat and what goes back: reading the agent's feed of
 * events from its own cursor, deciding which wake it, handing each to its
 * thread's session, and when the turn ends, posting the reply and leaving the
 * receipt, which names the event. It reaches chat only through the link it is
 * handed and the agent's sessions only through `Turns`, so it must not know the
 * engine, a transport, or how a session or a record is stored. It also decides
 * how an event and a message read to the model, and how a text too long for one
 * message is split.
 */
export { type Intake, type IntakeOptions, startIntake } from "./intake.ts";
export { standing } from "./prompt.ts";
export { inParts } from "./reply.ts";
export type { Outstanding, Snapshot, Turn, TurnOutcome, Turns } from "./turns.ts";
