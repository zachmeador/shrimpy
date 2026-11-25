/**
 * The chat contract: what any member, you or an agent, may ask of the chat
 * server, as Chord objects at `chat()`. `Chat` is the caller as a member, with
 * its channels and its feed, and everything a member does, by ID; `Channel` is
 * one channel and its threads, and `Thread` one thread and its messages, which
 * a client holds to show them; `ChatPresence` is the chat server being there,
 * which the gateway holds. Every reference is live, so a client follows
 * by holding, and nothing polls. Channels, DMs and rooms, and their threads are
 * the shared record of what was said: a log of events (posted, edited,
 * deleted, reacted, receipted) and the messages they add up to. A member writes
 * only in the channels it is in, and you read the others too. For you alone,
 * chat keeps the last message you have seen in each thread, and counts what is
 * new to you after it.
 *
 * It carries facts, such as which members a message mentions, and must not
 * know what a fact means to whoever reads it, or anything about agents'
 * sessions, the engine or any chat provider. The one thing it says about agents
 * is the names of the commands a person can write in a thread for them to act
 * on, with a line on each, who each is for in a room when it names nobody, and
 * how a text is told to be one, so that a client shows what an agent acts on
 * and for whom, and everyone reads a text the same way; how an agent acts is its
 * own. What a receipt says to a person is here too, what a thread and a
 * channel are called, members' names in order, how a room is written for the
 * command that adds a member to it, why a DM can't be joined, why chat takes
 * someone for nobody, and that whoever reads has not talked to a member yet, so
 * that every client and chat's own refusals say them the same way; and finding
 * a member, a room or a DM by what it is called, and a member's name by its ID,
 * as the clients and the agent's tools do; and where a text says `@name`, so
 * that chat records whom a message mentions and a client marks the same words.
 * This door is safe for browsers.
 */
export { Channel } from "./channel.ts";
export { Chat } from "./chat.ts";
export { AGENT_COMMANDS, type AgentCommand, agentCommandIn } from "./commands.ts";
export { findDm, findMember, findRoom, namer } from "./lookups.ts";
export { mentions, mentionsOf } from "./mentions.ts";
export { ChatPresence } from "./presence.ts";
export {
  type Attachment,
  type ChatEvent,
  type LeftReceipt,
  MAX_MESSAGE_LENGTH,
  MAX_RECEIPT_DETAIL_LENGTH,
  MAX_TRIGGER_LINE_LENGTH,
  type Member,
  type Message,
  type Reaction,
  type Receipt,
  type TriggerLine,
  type Working,
} from "./shapes.ts";
export { Thread } from "./thread.ts";
export {
  addToRoom,
  ARCHIVED,
  channelLabel,
  DM_TAKES_NO_MORE,
  firedWords,
  memberNames,
  NO_MESSAGES,
  NO_ROOMS,
  notInRoom,
  notTalkedTo,
  ONLY_MEMBERS,
  PINNED,
  receiptWords,
  roomLabel,
  roomWord,
  taggedTitle,
  threadTags,
  titleOf,
  triggerLabel,
} from "./words.ts";
