/**
 * Talking to agents the way a person does, or as the agent whose shell the
 * command runs in: linking to the gateway, which is this machine's, or the one
 * that the shell's agent, when it is apart from the gateway, or this machine,
 * when it has joined a gateway as the person's own, reaches over its entry, as
 * whoever the command is: the agent, the person whose machine this is, or you on
 * the gateway's own socket. Through that link it holds the roster, chat and its
 * channels and threads, and an agent's objects, wherever the agent runs. It
 * finds the member a name means, the home in the Shrimpy folder of an agent on
 * the roster, your DM with it and the room a name means, and watches a thread
 * for what an agent did with a message. It joins a gateway with the link of an invitation, too: as the
 * agent of a home, from apart, or as a machine of the person's own. It must not
 * know how a command prints, or how an agent works: what became of a message is
 * read from the receipts on its events in the thread, never asked of the agent.
 */
export { type AgentReached, homeOfMember, homeOnRoster, onAgent, onSession, reachAgent, requireAdminFor, type Sought } from "./agent.ts";
export { agentNamed, memberNamed, membersNamed, notRunning, runningAgent } from "./agents.ts";
export { askGateway, askLocalGateway, withGatewayAsMe } from "./gateway.ts";
export { JoinFailedError } from "./join.ts";
export { joinHome } from "./join-home.ts";
export { joinAsMachine } from "./join-machine.ts";
export { me } from "./me.ts";
export { type HeldAgent, type HeldSession, type HeldThread, onChannel, onRoster } from "./objects.ts";
export { type Reached, reachChat } from "./reach.ts";
export { type Waited, waitForReceipt } from "./receipts.ts";
export { MAKE_A_ROOM, roomNamed, roomNameWritten } from "./rooms.ts";
export { inOwnShell, shellActingOn } from "./shell.ts";
