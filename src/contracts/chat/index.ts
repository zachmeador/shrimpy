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
 * own. This door is safe for browsers.
 */
export { Channel, ChannelSchema } from "./channel.ts";
export { Chat } from "./chat.ts";
export { AGENT_COMMANDS, type AgentCommand, type AgentCommandLines, agentCommandIn } from "./commands.ts";
export { ChatPresence } from "./presence.ts";
export {
  type ChatEvent,
  ChatEventSchema,
  type LeftReceipt,
  LeftReceiptSchema,
  MAX_MESSAGE_LENGTH,
  MAX_RECEIPT_DETAIL_LENGTH,
  type Member,
  MemberSchema,
  type Message,
  type MessageRef,
  MessageRefSchema,
  MessageSchema,
  type Reaction,
  ReactionSchema,
  type Receipt,
  ReceiptSchema,
  type Working,
  WorkingSchema,
} from "./shapes.ts";
export { Thread, ThreadSchema } from "./thread.ts";
