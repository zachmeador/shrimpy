/**
 * The client side of a connection to a Pi server program: connect, bind the
 * program's service, tell listeners when the connection ends, and attach to a
 * route and wait for the server to announce it. Each contract wraps this in its
 * own shapes. It must not know any program's services or what they mean. Safe
 * for browsers.
 */
export { type Connection, type ConnectionOptions, openConnection } from "./connection.ts";
export { received } from "./received.ts";
export { type Attachment, openRoutedConnection, type RoutedConnection, type Routing } from "./routed.ts";
