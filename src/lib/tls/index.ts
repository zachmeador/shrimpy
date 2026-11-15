/**
 * Keys that prove who is at the other end of a link by their fingerprint, with
 * no certificate authority: whether text is a fingerprint, here, for browsers
 * too; and through `node.ts`, making a key, its fingerprint and the
 * self-signed certificate TLS serves it in. It must not know where a key is
 * kept or whose it is.
 */
export { isFingerprint } from "./fingerprint.ts";
