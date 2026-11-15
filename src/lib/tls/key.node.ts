import { createHash, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";

/** A new private key to prove one end of a link with: Ed25519, which is what the certificate here is made around. */
export function newKey(): KeyObject {
  return generateKeyPairSync("ed25519").privateKey;
}

/**
 * The fingerprint of `key`, a private key or the public key a certificate
 * holds: the first 16 bytes of the SHA-256 of the public key in DER, in
 * base64url. Finding another key with the same fingerprint takes about 2^128
 * tries, which is as short as a fingerprint stays safe, and short enough to
 * paste.
 */
export function fingerprintOf(key: KeyObject): string {
  const publicKey = key.type === "private" ? createPublicKey(key) : key;
  const der = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest().subarray(0, 16).toString("base64url");
}
