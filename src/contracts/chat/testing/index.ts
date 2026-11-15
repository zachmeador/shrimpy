/**
 * Test support for the chat contract: the real chat server, started through the
 * command in a process of its own; a member of chat as a test speaks for it,
 * over any host that holds chat's objects, you linked to the test's gateway or
 * an agent's program, with each call answering what it did or failing with what
 * chat refused; your DM with an agent, kept across a gateway that goes away; and
 * the roster's member a name means. Only tests and test fixtures import this,
 * and it must not know about any program but the command that starts one.
 */
export { type ChatListening, startTestChat, type TestChat } from "./chat.ts";
export {
  enterAsAgent,
  enterAsPerson,
  type Holder,
  joinRoster,
  memberNamed,
  onChannel,
  onChat,
  onThread,
  type Speaking,
  speakingAs,
  valueOf,
} from "./speaking.ts";
export { type Talk, talkTo } from "./talk.ts";
