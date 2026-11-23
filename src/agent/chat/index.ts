/**
 * The agent's side of chat: reading its feed from its own place, deciding which
 * events wake it and taking each up as an input of its thread's session, acting
 * on the commands a person writes, posting replies and leaving receipts, closing
 * the questions it asked when their answers come, and marking the threads it
 * works in. It reaches chat only through the link it is handed, and the agent's
 * records only through `Admissions`, so it must not know a transport, or how a
 * session or a record is stored. What takes an event up is behind `durable.ts`.
 */
export type { Admissions } from "./admissions.ts";
export { type ChatDelivery, createDelivery, type DeliveryOptions } from "./delivery.ts";
export { PICKED_UP_AGAIN } from "./reply.ts";
export { readFeed } from "./feed.ts";
export { createWakes, type Wakes } from "./policy.ts";
export { inParts } from "./reply.ts";
export { channelOfThread } from "./thread.ts";
export { markWorking } from "./working.ts";
