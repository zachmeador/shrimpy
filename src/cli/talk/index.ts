/**
 * Talking to agents the way a person does, or as the agent whose shell the
 * command runs in: asking the gateway what is running and who is on the
 * roster, which is this machine's, or the one an agent apart from the gateway
 * reaches over its entry, reaching the chat server by its name through the
 * gateway with a ticket, so that the gateway says who is talking, finding the
 * member a name means, your DM with it and the room a name means, and watching
 * a thread for what an agent did with a message. From an agent's shell it also
 * reaches another agent on this machine by its name through the gateway, as the
 * agent whose shell it is, and asks the gateway whether that agent is an admin.
 * It must not know how a command prints, or how an agent works: what became of
 * a message is read from the receipts on its events in the thread, never asked
 * of the agent.
 */
export { reachAgent, requireAdminFor } from "./agent.ts";
export { agentNamed, memberNamed, membersNamed, runningAgent } from "./agents.ts";
export { dmWith } from "./dm.ts";
export { askGateway, type GatewayView, withGatewayAsMe } from "./gateway.ts";
export { START_EVERYTHING } from "./hints.ts";
export { type Reached, reachChat } from "./reach.ts";
export { type Waited, waitForReceipt } from "./receipts.ts";
export { roomNamed, roomNameWritten } from "./rooms.ts";
export { shellActingOn } from "./shell.ts";
