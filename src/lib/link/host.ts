import type { HostError } from "@earendil-works/chord";

/**
 * What a Chord host reports going wrong in the background, as an `Error` whose
 * message says what: the kind of failure, and the words of what failed when
 * the report has them, which is the error's cause.
 */
export function hostFailure(error: HostError): Error {
  const cause = "error" in error ? error.error : "failure" in error ? error.failure.error : undefined;
  return new Error(`${error.kind}${cause instanceof Error ? `: ${cause.message}` : ""}`, { cause });
}
