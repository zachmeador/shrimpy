/**
 * What arrives from chat and what goes back: reading the agent's feed of
 * events from its own cursor, deciding which wake it, admitting each as a task
 * of its thread's session, and, once that task knows how the turn ended,
 * posting the reply and leaving the receipt, which names the event. It also
 * tells chat which threads the agent is working in. It reaches chat only
 * through the link it is handed and the agent's sessions only through
 * `Admissions` and `Working`, and the sessions reach it through `Delivery`, so
 * it must not know the engine, a transport, or how a session or a record is
 * stored. It also decides how an event and a message read to the model, and
 * how a text too long for one message is split.
 */
export { createDelivery, type Delivery, type DeliveryOptions } from "./delivery.ts";
export { type Admissions, idOf, type Outstanding, type Snapshot, type TurnOutcome, type Working } from "./events.ts";
export { type Intake, type IntakeOptions, startIntake } from "./intake.ts";
export { promptFor, standing } from "./prompt.ts";
export { inParts } from "./reply.ts";
