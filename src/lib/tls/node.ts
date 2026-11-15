/**
 * The Node-only door of keys that prove a link's end by their fingerprint:
 * making a key, its fingerprint, and the self-signed certificate TLS serves it
 * in. Browser code must not import this file.
 */
export { selfSignedCertificate } from "./certificate.node.ts";
export { fingerprintOf, newKey } from "./key.node.ts";
