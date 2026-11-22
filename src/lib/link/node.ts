/**
 * Links between Shrimpy's programs, made for Chord: a WebSocket on a Unix
 * socket's path, or at an address over TLS, where the listener's key proves
 * it to whoever dials by the key's fingerprint, with one JSON text frame each
 * way before Chord's binary ones, the hello and its answer. Listening for
 * them, turning web pages away, or serving a page and taking links from it
 * alone, and bounding what a connection can make the listener hold before a
 * link takes it; dialing one, sending the hello only to the key it is meant
 * for, and telling when nothing listens at a socket's path. It must not know
 * what a hello says, who may link, what a page is made of or where a key is
 * kept. This is the Node-only door; `index.ts` has how an address is written,
 * dialing from a page, and keeping a link.
 */
export { type Dialed, type DialPlace, dial, nobodyThere, OtherKeyError } from "./dial.node.ts";
export { type Certificate, fromItsOwnPage, type Greeted, type Listener, type ListenOptions, listen } from "./listen.node.ts";
