/**
 * The chat API: what any member, person or agent, may ask of the chat server.
 * Channels, DMs and rooms, and their threads are the shared record of what was
 * said: a log of events (posted, edited, deleted, reacted, receipted) and the
 * messages they add up to. A client reaches the chat server by its name through
 * the gateway, which is told where it listens and nobody else is, so this
 * contract has no address in it. It also holds the rule for what a text
 * mentions, `@name` or `@all`, so that the chat server and an agent read it the
 * same way. It must not know about agents' sessions, the engine or any chat
 * provider. This door is safe for browsers.
 */
export {
  type ChatClient,
  type ChatConnection,
  connectChat,
  type ThreadHandle,
} from "./connect.ts";
export { mentions } from "./mentions.ts";
export { Chat, ThreadService } from "./services.ts";
export { MAX_MESSAGE_LENGTH, MAX_RECEIPT_DETAIL_LENGTH } from "./view.ts";
export type {
  Channel,
  ChatEvent,
  Member,
  Message,
  MessageRef,
  Reaction,
  Receipt,
  Thread,
  ThreadView,
  Working,
} from "./view.ts";
