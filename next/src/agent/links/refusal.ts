import { RemoteServiceError } from "@earendil-works/chord";

/**
 * Whether the other program answered and said no, as opposed to not answering
 * at all: the arguments were wrong, or the caller may not do this. Asking again
 * the same way will get the same answer.
 */
export function isRefusal(error: unknown): error is RemoteServiceError {
  return (
    error instanceof RemoteServiceError &&
    (error.code === "service_invalid_value" || error.code === "service_not_allowed")
  );
}
