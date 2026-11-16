/**
 * The agent's links to the other programs, over its own host: keeping it linked
 * to the gateway as the agent, which is how it is a member and how requests for
 * it arrive, and saying when an agent apart loses the gateway and finds it
 * again; following the roster it holds at the gateway; and holding chat, with
 * the calls the agent makes there. Each is handed the host and where the
 * gateway is, so none of this assumes it is on this machine. It must not know
 * what the agent says to chat or does with what chat offers, or who may do what.
 */
export { callSignal, type ChatCalls, chatFailure, type ChatLink, isUnavailable, type LiveChat, openChatLink } from "./chat.ts";
export { type GatewayLink, type GatewayLinkOptions, linkToGateway, type MembershipStore } from "./gateway.ts";
export { createRoster, type LiveRoster } from "./roster.ts";
