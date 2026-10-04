import { RemoteServiceError } from "@earendil-works/chord";
import { ServerError } from "@earendil-works/pi-client";

/**
 * Whether the other program answered and said no, as opposed to not answering
 * at all: the arguments were wrong, or the caller may not do this. Asking again
 * the same way will get the same answer. A refusal reaches a caller in the same
 * process as a Chord service error, and one across a connection as the
 * protocol's server error carrying the same code.
 */
export function isRefusal(error: unknown): error is RemoteServiceError | ServerError {
  if (!(error instanceof RemoteServiceError || error instanceof ServerError)) return false;
  return error.code === "service_invalid_value" || error.code === "service_not_allowed";
}
