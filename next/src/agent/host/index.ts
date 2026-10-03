/**
 * The owner of a home: takes the home's lock, then opens its storage and
 * engine. Nothing else in Shrimpy opens a home's storage. It must not know
 * about clients, chat or how the agent is reached.
 */
export { type Host, type HostOptions, openHost } from "./host.ts";
export { HomeOwnedError, type OwnerLock, takeOwnerLock } from "./owner-lock.ts";
