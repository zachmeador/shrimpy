/**
 * What the chat API means: who a member is, which channels and threads it can
 * see, what posting, reading and leaving receipts do, who is working where, and
 * the live view of a thread. Each operation takes the caller and runs as one
 * store transaction. It must not know about sockets, connections or any chat
 * provider.
 */
export { threadExists, watchableThread } from "./access.ts";
export type { ChatDeps } from "./deps.ts";
export {
  archiveThread,
  createThread,
  listChannels,
  listThreads,
  openDm,
  renameThread,
  setWorking,
} from "./directory.ts";
export { identify } from "./identity.ts";
export { post, readMessages } from "./messages.ts";
export { leaveReceipt } from "./receipts.ts";
export { type ServedThread, serveThread } from "./served-thread.ts";
export { createWorkingMarks, type WorkingMarks } from "./working.ts";
