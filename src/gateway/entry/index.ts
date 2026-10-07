/**
 * The gateway's network entry: HTTP servers on the addresses it was told to
 * listen on, which pipe a WebSocket to the gateway or to a program that is
 * running, for an agent apart from the gateway, and take the connection that
 * such an agent opens to answer a call. A program is reached only with a ticket
 * that is good for it, and a call is answered only with the ID of a call that
 * is waiting, once. It must not know how programs are registered, how a call
 * is made, who is on the roster or what is said through a pipe.
 */
export { type Entry, type EntryOptions, startEntry } from "./entry.ts";
