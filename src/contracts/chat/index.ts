/**
 * The chat contract: what any member, you or an agent, may ask of the chat
 * server, as Chord objects at `chat()`. `Chat` is the caller as a member, with
 * its channels and its feed; `Channel` is one channel and its threads; `Thread`
 * is one thread and its messages; `ChatPresence` is the chat server being
 * there, which the gateway holds. Every reference is live, so a client follows
 * by holding, and nothing polls. Channels, DMs and rooms, and their threads are
 * the shared record of what was said: a log of events (posted, edited,
 * deleted, reacted, receipted) and the messages they add up to. A member writes
 * only in the channels it is in, and you read the others too.
 *
 * It carries facts, such as which members a message mentions, and must not
 * know what a fact means to whoever reads it, or anything about agents'
 * sessions, the engine or any chat provider. The one thing it says about agents
 * is the names of the commands a person can write in a thread for them to act
 * on, with a line on each, who each is for in a room when it names nobody, and
 * how a text is told to be one, so that a client shows what an agent acts on
 * and for whom, and everyone reads a text the same way; how an agent acts is its
 * own. What a receipt says to a person is here too, so that every client says
 * it the same way, and finding a member, a room or a DM by what it is called,
 * as the clients and the agent's tools do. This door is safe for browsers.
 */
export { Channel } from "./channel.ts";
export { Chat } from "./chat.ts";
export { AGENT_COMMANDS, type AgentCommand, agentCommandIn } from "./commands.ts";
export { findDm, findMember, findRoom } from "./lookups.ts";
export { ChatPresence } from "./presence.ts";
export {
  type ChatEvent,
  type LeftReceipt,
  MAX_MESSAGE_LENGTH,
  MAX_RECEIPT_DETAIL_LENGTH,
  type Member,
  type Message,
  type Reaction,
  type Receipt,
  type Working,
} from "./shapes.ts";
export { Thread } from "./thread.ts";
export { NO_ROOMS, notInRoom, receiptWords } from "./words.ts";
