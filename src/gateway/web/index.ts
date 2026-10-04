/**
 * The gateway's browser entry: an HTTP server on loopback that pipes a
 * WebSocket to the Unix socket of a program that is running, and serves the
 * web client's files. It must not know how programs are registered or what
 * they say through the pipe. Nothing authenticates a browser yet, so it
 * binds to loopback only and refuses pages from other origins. A page can open
 * a pipe to a program but not come in to it, since coming in takes a ticket
 * and a page cannot get one.
 */
export { startWeb, type WebEntry, type WebOptions } from "./web.ts";
