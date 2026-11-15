/**
 * What the chat contract means: which channels and threads a member reads
 * (its own, and for you every other) and which it writes in (its own), what
 * `Chat`, `Channel` and `Thread` show each caller, how DMs and rooms are made,
 * which members a post mentions, what posting, editing, deleting, reacting,
 * reading and leaving receipts do and who may do them, and who is working
 * where. Each operation takes the caller, as the roster has it now, and runs
 * as one store transaction, refusing with words for a person. It must not know
 * about links, Chord's objects or any chat provider, or how the roster is held.
 */
export type { ChatDeps } from "./deps.ts";
export {
  addMembers,
  archiveThread,
  createRoom,
  createThread,
  openDm,
  renameThread,
  setWorking,
} from "./directory.ts";
export { deleteMessage, editMessage } from "./edits.ts";
export { post, readMessages } from "./messages.ts";
export { react, unreact } from "./reactions.ts";
export { leaveReceipt } from "./receipts.ts";
export { renameMembers } from "./renames.ts";
export { type ChannelView, channelView, type ChatView, chatView, NOT_A_MEMBER, type ThreadView, threadView } from "./views.ts";
export { createWorkingMarks, type WorkingMarks } from "./working.ts";
