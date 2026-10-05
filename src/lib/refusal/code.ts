/**
 * What a refusal's code holds. Its code is the one part of it, besides its
 * message, that reaches the caller, so that is where a refusal says which case
 * it is: the kind, then a colon and the reason when it has one. Chord types its
 * codes as a fixed set, which the wire does not hold to: the protocol carries
 * any non-empty string.
 */
const SEPARATOR = ":";

/** The code of a refusal of this kind, with the reason it gives. */
export function encode(kind: string, reason: string | undefined): string {
  return reason === undefined ? kind : `${kind}${SEPARATOR}${reason}`;
}

/** The kind in a refusal's code, and its reason if it has one. */
export function decode(code: string): { kind: string; reason: string | undefined } {
  const at = code.indexOf(SEPARATOR);
  return at === -1 ? { kind: code, reason: undefined } : { kind: code.slice(0, at), reason: code.slice(at + 1) };
}
