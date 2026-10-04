/**
 * Talking to agents the way a person does: asking this machine's gateway what
 * is running and who is on the roster, reaching the chat server through it
 * with a ticket, so that the gateway says who is talking, finding the agent a
 * name means and your DM with it, and watching a thread for what an agent did
 * with a message. It must not know how a command prints, or how an agent works:
 * what became of a message is read from its receipts in the thread, never
 * asked of the agent.
 */
export { agentNamed, runningAgent } from "./agents.ts";
export { dmWith } from "./dm.ts";
export { askGateway, type GatewayView } from "./gateway.ts";
export { type Reached, reachChat } from "./reach.ts";
export { type Waited, waitForReceipt } from "./receipts.ts";
