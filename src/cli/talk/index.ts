/**
 * Talking to agents the way a person does, or as the agent whose shell the
 * command runs in: asking this machine's gateway what is running and who is on
 * the roster, reaching the chat server by its name through the gateway with a
 * ticket, so that the gateway says who is talking, finding the member a name
 * means, your DM with it and the room a name means, and watching a thread for
 * what an agent did with a message. It must not know how a command prints, or
 * how an agent works: what became of a message is read from the receipts on its
 * events in the thread, never asked of the agent.
 */
export { agentNamed, memberNamed, membersNamed, runningAgent } from "./agents.ts";
export { dmWith } from "./dm.ts";
export { askGateway, type GatewayView } from "./gateway.ts";
export { START_EVERYTHING } from "./hints.ts";
export { type Reached, reachChat } from "./reach.ts";
export { type Waited, waitForReceipt } from "./receipts.ts";
export { roomNamed, roomNameWritten } from "./rooms.ts";
