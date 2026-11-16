/**
 * Whatever was thrown, as an `Error`, so that whoever is told of a failure
 * always gets one with a message. It must not know what failed or who is told.
 * Safe for browsers.
 */

/** `thrown` when it is an `Error`, and otherwise an `Error` whose message is `thrown` as text. */
export function asError(thrown: unknown): Error {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}
