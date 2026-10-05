/**
 * What arrives from chat and what goes back: reading the agent's feed of
 * events from its own cursor, deciding which wake it by the policy the agent
 * chose for the room, a reply that answers a message of the agent's own among
 * them, admitting each as a task of its thread's session, with, in a room, what
 * was said there since the agent last looked, and, once that task knows how the
 * turn ended, posting the reply and leaving the receipt, which names the event.
 * The same goes for a wake-up the agent asked for, which the sessions admit when
 * it is due: its reply is posted, and it has no receipt. The same goes for an
 * occurrence of a standing trigger, whose reply is posted only if the trigger
 * names a thread. Intake also tells chat which threads the agent is working in,
 * and finds which channel a thread is in, for a trigger whose thread the agent
 * has no session behind yet. It reaches chat only through the link it is handed
 * and the agent's sessions only through `Admissions` and `Working`, and the
 * sessions reach it through `Delivery`, so it must not know the engine, a
 * transport, or how a session or a record is stored. It also decides how an
 * event, a wake-up, an occurrence and a message read to the model, and how a
 * text too long for one message is split. It marks a person's message that
 * mentions the agent as urgent, so that a turn that is running reads it at its
 * next step.
 */
export { createDelivery, type Delivery, type DeliveryOptions } from "./delivery.ts";
export {
  type Admissions,
  type ChatInput,
  type Ending,
  idOf,
  isChat,
  isOccurrence,
  isUrgent,
  isWakeup,
  type Occurrence,
  type OccurrenceInput,
  type Outstanding,
  type Snapshot,
  threadOf,
  type TurnOutcome,
  type Wakeup,
  type WakeupInput,
  type Working,
} from "./events.ts";
export { type Intake, type IntakeOptions, startIntake } from "./intake.ts";
export {
  createWakes,
  DEFAULT_WAKE_POLICY,
  isWakePolicy,
  WAKE_POLICIES,
  type WakePolicies,
  type WakePolicy,
  type Wakes,
  type WakeSettings,
} from "./policy.ts";
export { promptFor, standing } from "./prompt.ts";
export { endingOf, inParts } from "./reply.ts";
export { channelOfThread, placeOfThread, type ThreadPlace } from "./thread.ts";
