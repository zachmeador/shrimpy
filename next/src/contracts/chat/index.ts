/**
 * The chat API: what any member, person or agent, may ask of the chat server.
 * Channels and threads are the shared record of what was said. It must not
 * know about agents' sessions, the engine or any chat provider. This door is
 * safe for browsers; `node.ts` adds the parts that need Node.
 */
export {
  type ChatClient,
  type ChatConnection,
  connectChat,
  type ThreadHandle,
} from "./connect.ts";
export { type ChatEndpoint, chatEndpointFile } from "./endpoint.ts";
export { Chat, ThreadService } from "./services.ts";
export type { Channel, Member, Message, Thread, ThreadView, Working } from "./view.ts";
