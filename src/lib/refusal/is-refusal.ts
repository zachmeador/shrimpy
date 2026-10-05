import { RemoteServiceError } from "@earendil-works/chord";
import { ServerError } from "@earendil-works/pi-client";
import { decode } from "./code.ts";

/**
 * Whether the other program answered and said no, as opposed to not answering
 * at all: the arguments were wrong, or the caller may not do this. Asking again
 * the same way will get the same answer. A refusal reaches a caller in the same
 * process as a Chord service error, and one across a connection as the
 * protocol's server error carrying the same code.
 */
export function isRefusal(error: unknown): error is RemoteServiceError | ServerError {
  if (!(error instanceof RemoteServiceError || error instanceof ServerError)) return false;
  const { kind } = decode(error.code);
  return kind === "service_invalid_value" || kind === "service_not_allowed";
}

/** Which case a refusal says it is, if it says: what the refusing program gave as its reason. */
export function reasonOf(error: unknown): string | undefined {
  return isRefusal(error) ? decode(error.code).reason : undefined;
}
