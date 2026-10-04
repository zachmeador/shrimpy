/**
 * What arrives from chat and what goes back: reading the agent's feed from its
 * own cursor, waking on the messages addressed to it, handing each to its
 * thread's session, and when the turn ends, posting the reply and leaving the
 * receipt. It reaches chat only through the link it is handed and the agent's
 * sessions only through `Turns`, so it must not know the engine, a transport,
 * or how a session or a record is stored. It also decides how a message reads
 * to the model, and how a text too long for one message is split.
 */
export { type Intake, type IntakeOptions, startIntake } from "./intake.ts";
export { written } from "./prompt.ts";
export { inParts } from "./reply.ts";
export type { Outstanding, Snapshot, Turn, TurnOutcome, Turns } from "./turns.ts";
