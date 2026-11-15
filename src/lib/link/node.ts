/**
 * Links between Shrimpy's programs, made for Chord: a WebSocket on a Unix
 * socket's path, or at an address over TLS, where the listener's key proves
 * it to whoever dials by the key's fingerprint, with one JSON text frame each
 * way before Chord's binary ones, the hello and its answer. Listening for
 * them, turning web pages away; dialing one, sending the hello only to the key
 * it is meant for; and keeping one, dialing again after a drop. It must not
 * know what a hello says, who may link or where a key is kept. Node only, so
 * this is its only door.
 */
export { type DialOptions, type Dialed, type DialPlace, dial, OtherKeyError } from "./dial.node.ts";
export { type KeepLinkOptions, keepLink } from "./keep.node.ts";
export { type Linked } from "./linked.node.ts";
export { type Greeted, type Listener, type ListenOptions, type ListenPlace, listen } from "./listen.node.ts";
export { describePlace, type Place } from "./place.ts";
