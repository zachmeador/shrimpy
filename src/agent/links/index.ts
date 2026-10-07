/**
 * The agent's links to the other programs: being a member of the network and
 * staying registered with the gateway, saying when an agent apart loses it and
 * finds it again, joining it from apart with an invitation, answering the
 * calls the gateway makes for an agent it can't dial, asking the gateway whose
 * a ticket is, and keeping a connection to the chat server that is made by its
 * name through the gateway, entered with a ticket from it, and lost and found
 * again. Each link is handed how to reach the program on the other end, so none
 * of this assumes it is on this machine. It must not know what the agent says
 * to chat or does with what chat offers, or what the bytes of a call mean.
 */
export { type Answering, type AnsweringOptions, answerCalls } from "./answering.ts";
export { type ChatLink, type ChatLinkOptions, type LiveChat, openChatLink } from "./chat.ts";
export { type GatewayLinkOptions, joinGateway, type MembershipStore } from "./gateway.ts";
export { whoseTicket } from "./identity.ts";
export { JoinFailedError, joinHome, type JoinedHome, type JoinHomeOptions } from "./join-home.ts";
export { ChatUnavailableError } from "./unavailable.ts";
