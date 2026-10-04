/**
 * The agent's links to the other programs: staying registered with the
 * gateway, and keeping a connection to the chat server that is lost and found
 * again. Each link is handed how to reach the program on the other end, so none
 * of this assumes it is on this machine; the defaults reach both locally. It
 * must not know what the agent says to chat or does with what chat offers.
 */
export { type ChatLink, type ChatLinkOptions, type LiveChat, type OpenChat, openChatLink } from "./chat.ts";
export { joinGateway } from "./gateway.ts";
export { type ChatRoutes, findChat, openChatLocally } from "./local.ts";
export { isRefusal } from "./refusal.ts";
export { ChatUnavailableError } from "./unavailable.ts";
