import { createCipheriv, createECDH, createHmac, type ECDH, type KeyObject, randomBytes, sign } from "node:crypto";

/**
 * Where a browser is told things, from its push subscription: the address its
 * push service gave it, and the keys a message for it is encrypted with, in
 * base64url.
 */
export interface WebPushPlace {
  readonly endpoint: string;
  /** The browser's public key on P-256, uncompressed: 65 bytes, the first of them 4. */
  readonly p256dh: string;
  /** The secret the browser shares with whoever tells it things: 16 bytes. */
  readonly auth: string;
}

/** The size of the one record a message goes in, which RFC 8291 asks to be more than the message, its padding and its tag. */
const RECORD_SIZE = 4096;

/** How long a token for a push service is good for. RFC 8292 allows a day at most. */
const TOKEN_SECONDS = 12 * 60 * 60;

/** HMAC-SHA-256 of the parts of `data`, one after another, under `key`: each step of HKDF as RFC 8291 writes it out. */
function hmac(key: Uint8Array, ...data: Uint8Array[]): Buffer {
  const mac = createHmac("sha256", key);
  for (const part of data) mac.update(part);
  return mac.digest();
}

const ONE = Buffer.from([1]);
const KEY_INFO = Buffer.from("WebPush: info\0", "latin1");
const CEK_INFO = Buffer.from("Content-Encoding: aes128gcm\0", "latin1");
const NONCE_INFO = Buffer.from("Content-Encoding: nonce\0", "latin1");
/** What ends the one record's plaintext, as RFC 8188 marks the last record, with no padding after it. */
const LAST_RECORD = Buffer.from([2]);

/**
 * `message` encrypted for the browser at `place`, as RFC 8291 says, in the one
 * record of RFC 8188's aes128gcm: a header with `salt`, the record's size and
 * the sender's public key, then the ciphertext. `sender` is a key pair made for
 * this message alone and `salt` is 16 random bytes; the standard's example
 * gives both. A browser's key that is not on P-256 is refused.
 */
export function encryptWith(message: Uint8Array, place: WebPushPlace, salt: Uint8Array, sender: ECDH): Buffer {
  const receiver = Buffer.from(place.p256dh, "base64url");
  const senderPublic = sender.getPublicKey();
  const ikm = hmac(hmac(Buffer.from(place.auth, "base64url"), sender.computeSecret(receiver)), KEY_INFO, receiver, senderPublic, ONE);
  const prk = hmac(salt, ikm);
  const cipher = createCipheriv("aes-128-gcm", hmac(prk, CEK_INFO, ONE).subarray(0, 16), hmac(prk, NONCE_INFO, ONE).subarray(0, 12));
  const sealed = Buffer.concat([cipher.update(message), cipher.update(LAST_RECORD), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  header.set(salt, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(senderPublic.length, 20);
  return Buffer.concat([header, senderPublic, sealed]);
}

/** `message` encrypted for the browser at `place`, with a key pair and a salt of its own. */
export function encrypt(message: Uint8Array, place: WebPushPlace): Buffer {
  const sender = createECDH("prime256v1");
  sender.generateKeys();
  return encryptWith(message, place, randomBytes(16), sender);
}

/** A key on P-256 as a push service is shown it, and a browser is given to subscribe with: uncompressed, in base64url. */
export function publicKeyOf(key: KeyObject): string {
  const { x, y } = key.export({ format: "jwk" });
  if (x === undefined || y === undefined) throw new Error("The key is not on an elliptic curve.");
  return Buffer.concat([Buffer.from([4]), Buffer.from(x, "base64url"), Buffer.from(y, "base64url")]).toString("base64url");
}

const encoded = (value: object): string => Buffer.from(JSON.stringify(value)).toString("base64url");

/** What RFC 8292's token says: the push service it is for, when it stops being good, and who to contact, if anyone. */
export interface Claims {
  readonly aud: string;
  readonly exp: number;
  readonly sub?: string;
}

/** RFC 8292's token: a JWT with `claims`, signed with `key` as ES256 asks. */
export function tokenFor(claims: Claims, key: KeyObject): string {
  const signed = `${encoded({ typ: "JWT", alg: "ES256" })}.${encoded(claims)}`;
  const signature = sign("sha256", Buffer.from(signed), { key, dsaEncoding: "ieee-p1363" });
  return `${signed}.${signature.toString("base64url")}`;
}

/**
 * What a request to the push service at `endpoint` says the gateway is, in its
 * `Authorization` header: RFC 8292's token, good for twelve hours from `now`,
 * signed with `key`, with the public key that checks it. `contact` is who the
 * push service may write to about the gateway, an https: or mailto: address.
 */
export function vapid(endpoint: string, key: KeyObject, contact: string | undefined, now: number): string {
  const claims: Claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + TOKEN_SECONDS };
  const token = tokenFor(contact === undefined ? claims : { ...claims, sub: contact }, key);
  return `vapid t=${token}, k=${publicKeyOf(key)}`;
}
