/**
 * The chat server's SQLite store: members, channels, threads and messages, with
 * one process as the only writer. Callers compose its small operations inside a
 * transaction, and watchers hear about what committed. It must not know what a
 * caller may see, how messages are addressed, or how anything is served.
 */
export type { ChannelRecord } from "./channels.ts";
export type { Change } from "./changes.ts";
export { StoreOwnedError } from "./database.ts";
export type { NewMessage } from "./messages.ts";
export { openStore, type Store, type StoreOptions, type Transaction } from "./store.ts";
