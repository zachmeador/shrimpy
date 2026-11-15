import { createPublicKey, type KeyObject, sign } from "node:crypto";
import { fingerprintOf } from "./key.node.ts";

/** One DER value: its tag, its length and what it holds. */
function der(tag: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat(parts);
  const size: number[] = [];
  for (let left = body.length; left > 0; left >>= 8) size.unshift(left & 0xff);
  const length = body.length < 0x80 ? [body.length] : [0x80 | size.length, ...size];
  return Buffer.concat([Buffer.from([tag, ...length]), body]);
}

const sequence = (...parts: Buffer[]): Buffer => der(0x30, ...parts);

/** The algorithm Ed25519 signs with, by its object identifier 1.3.101.112. */
const ED25519 = sequence(der(0x06, Buffer.from([0x2b, 0x65, 0x70])));

/** A name with only a common name (2.5.4.3), as UTF-8. */
const commonName = (name: string): Buffer =>
  sequence(der(0x31, sequence(der(0x06, Buffer.from([0x55, 0x04, 0x03])), der(0x0c, Buffer.from(name, "utf8")))));

/** From the first moment of 2000, as a UTCTime, to the last of 9999, as a GeneralizedTime: no end, as RFC 5280 writes it. */
const ALWAYS = sequence(der(0x17, Buffer.from("000101000000Z")), der(0x18, Buffer.from("99991231235959Z")));

/**
 * A self-signed X.509 certificate around the Ed25519 private key `key`, in
 * PEM, which is how Node's TLS serves a key. Nothing checks it but by the key's
 * fingerprint, so it says as little as a certificate can: version 1, the
 * fingerprint as the name of its subject and its issuer, a serial number from
 * the same hash, and no end. Made from the key alone, it is the same each time,
 * so it is made whenever it is needed and never kept.
 */
export function selfSignedCertificate(key: KeyObject): string {
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`A certificate is made here around an Ed25519 key, and this key is ${String(key.asymmetricKeyType)}.`);
  }
  const fingerprint = fingerprintOf(key);
  // A positive number with no leading zero, as DER asks.
  const serial = Buffer.from(fingerprint, "base64url");
  serial[0] = ((serial[0] ?? 0) & 0x7f) | 0x40;
  const name = commonName(fingerprint);
  const publicKey = createPublicKey(key).export({ type: "spki", format: "der" });
  const signed = sequence(der(0x02, serial), ED25519, name, ALWAYS, name, publicKey);
  const certificate = sequence(signed, ED25519, der(0x03, Buffer.from([0]), sign(null, signed, key)));
  const lines = certificate.toString("base64").match(/.{1,64}/g) ?? [];
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}
