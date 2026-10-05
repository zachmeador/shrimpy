/**
 * The chat server's SQLite store: members, channels, threads, the log of
 * events, the messages those events add up to, their reactions, and the
 * receipts agents leave on events, with one process as the only writer. It has
 * an ID of its own, given to it when it is made. Every change to a message, and
 * every receipt, is written together with the event that records it, in one
 * transaction. Callers compose its small operations inside a transaction, and
 * watchers hear about what committed. It must not know what a caller may see,
 * how a text is read for the members it mentions, or how anything is served.
 */
export type { ChannelRecord } from "./channels.ts";
export type { Change } from "./changes.ts";
export { StoreOwnedError } from "./database.ts";
export { openStore, type Store, type StoreOptions, type Transaction } from "./store.ts";
export type { ThreadRecord } from "./threads.ts";
