/**
 * Minting short random IDs that say what they name, such as `th_4k9x2m7q0b3d`.
 * It must not know what any ID names or where it is stored. Safe for browsers.
 */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const LENGTH = 12;

/**
 * An ID of `prefix`, an underscore and 12 random characters. They carry 60
 * bits, so a collision on one machine is not a practical concern, and whoever
 * stores them backs that up with a constraint. A machine prefix can go in front
 * of these later.
 */
export function newId(prefix: string): string {
  let id = "";
  for (const byte of crypto.getRandomValues(new Uint8Array(LENGTH))) id += ALPHABET.charAt(byte & 31);
  return `${prefix}_${id}`;
}
