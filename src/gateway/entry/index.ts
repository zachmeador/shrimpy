/**
 * The gateway's network entry: HTTP servers on the addresses it was told to
 * listen on, which pipe a WebSocket to the gateway or to a program that is
 * running, for an agent apart from the gateway. A program is reached only with
 * a ticket that is good for it. It must not know how programs are registered,
 * who is on the roster or what is said through a pipe.
 */
export { type Entry, type EntryOptions, startEntry } from "./entry.ts";
