/**
 * The agent's side of chat: reading its feed of events from its own cursor,
 * which is kept with the ID of the chat store it is in, deciding which wake it
 * by the members each mentions, whether it is in a DM or a room, and the policy
 * the agent chose for the room, a reply that answers a message of the agent's own
 * among them, and taking each up as an input of its thread's session, in a room
 * with what was said there since the agent last looked. Once the task that
 * follows an input knows how its turn ended, the reply is posted and the receipt
 * left, which names the event; a wake-up the agent asked for, an occurrence of a
 * trigger and the result of a question are posted the same way, and have no
 * receipt. A command a person writes in a thread, `/stop`, is no input: it is
 * acted on when the feed brings it, whatever the room's wake policy, and is never
 * handed to a session or a model. What an agent the agent asked a question posts
 * in their DM while the question is open belongs to the question and wakes nobody,
 * and the receipt it leaves on the question closes it, as a result for the
 * session that asked. It tells chat which threads the agent is working in, finds which
 * channel a thread is in, and where the thread is, for a trigger whose thread the
 * agent has no session behind yet, says where an event's thread is, as a DM with
 * someone or a room and who else is in it, marks a person's message as one
 * that joins the turn that is running, and splits a text too long for one message. It
 * reaches chat only through the link it is handed, and the agent's records only
 * through `Admissions`, so it must not know a transport, or how a session or a
 * record is stored. This door is all of it that needs no engine: what takes an
 * event up is behind `durable.ts`.
 */
export type { Admissions } from "./admissions.ts";
export { type ChatDelivery, createDelivery, type DeliveryOptions } from "./delivery.ts";
export { type Intake, type IntakeOptions, startIntake } from "./intake.ts";
export { createWakes, type WakePolicies, type Wakes } from "./policy.ts";
export { inParts } from "./reply.ts";
export { channelOfThread, placeOfThread, type ThreadPlace } from "./thread.ts";
