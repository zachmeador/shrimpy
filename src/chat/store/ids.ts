import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const LENGTH = 12;

export type IdKind = "ch" | "th" | "msg";

/**
 * A short random ID that says what it names, such as `th_4k9x2m7q0b3d`. Twelve
 * characters carry 60 bits, so a collision on one machine is not a practical
 * concern, and a database constraint backs that up. A machine prefix can go in
 * front of these later.
 */
export function newId(kind: IdKind): string {
  let id = "";
  for (const byte of randomBytes(LENGTH)) id += ALPHABET.charAt(byte & 31);
  return `${kind}_${id}`;
}
