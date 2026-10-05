/**
 * The agent's side of chat: reading its feed of events from its own cursor,
 * deciding which wake it by the policy the agent chose for the room, a reply that
 * answers a message of the agent's own among them, and taking each up as an input
 * of its thread's session, in a room with what was said there since the agent
 * last looked. Once the task that follows an input knows how its turn ended, the
 * reply is posted and the receipt left, which names the event; a wake-up the agent
 * asked for and an occurrence of a trigger are posted the same way, and have no
 * receipt. A command a person writes in a thread, `/stop`, is no input: it is
 * acted on when the feed brings it, whatever the room's wake policy, and is never
 * handed to a session or a model. It tells chat which threads the agent is
 * working in, finds which channel a thread is in for a trigger whose thread the
 * agent has no session behind yet, marks a person's message that mentions the
 * agent as urgent, and splits a text too long for one message. It reaches chat
 * only through the link it is handed, and the agent's records only through
 * `Admissions`, so it must not know a transport, or how a session or a record is
 * stored. Only `admissions.ts` touches the engine.
 */
export { createAdmissions } from "./admissions.ts";
export type { Admissions } from "./admit.ts";
export { createDelivery, type DeliveryOptions } from "./delivery.ts";
export { type Intake, type IntakeOptions, startIntake } from "./intake.ts";
export { createWakes, type WakePolicies, type Wakes } from "./policy.ts";
export { inParts } from "./reply.ts";
export { channelOfThread, placeOfThread, type ThreadPlace } from "./thread.ts";
