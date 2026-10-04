/**
 * The agent's links to the other programs: being a member of the network and
 * staying registered with the gateway, and keeping a connection to the chat
 * server that is found through the gateway, entered with a ticket from it, and
 * lost and found again. Each link is handed how to reach the program on the
 * other end, so none of this assumes it is on this machine. It must not know
 * what the agent says to chat or does with what chat offers.
 */
export { type ChatLink, type ChatLinkOptions, type LiveChat, openChatLink } from "./chat.ts";
export { type GatewayLinkOptions, joinGateway, type MembershipStore } from "./gateway.ts";
export { ChatUnavailableError } from "./unavailable.ts";
