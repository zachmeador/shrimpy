/**
 * The chat server's SQLite store: members, channels, threads, the log of
 * events, the messages those events add up to, their reactions, the receipts
 * agents leave on events, the requests members made of messages, and the read
 * marks members keep in threads, and the files members send, in pieces, with
 * one process as the only writer. It has
 * an ID of its own, given to it when it is made. A store an older release
 * wrote is copied aside and brought up to date when it opens. Every change to
 * a message, and every receipt, is written together with the event that
 * records it, in one transaction. Callers compose its small operations inside a transaction,
 * and watchers hear about what committed. It must not know what a caller may
 * see, how a text is read for the members it mentions, or how anything is
 * served.
 */
export type { AttachmentRecord } from "./attachments.ts";
export type { ChannelRecord } from "./channels.ts";
export type { Change } from "./changes.ts";
export { CHAT_FORMAT, type ChatFormat } from "./schema.ts";
export { openStore, type Store, type Transaction } from "./store.ts";
export type { ThreadRecord } from "./threads.ts";
