import { RemoteServiceError, type RemoteServiceErrorCode } from "@earendil-works/chord";
import { encode } from "./code.ts";

/**
 * A call a server will not carry out. It is a Chord service error, so the
 * server passes its message to the caller exactly as written here instead of
 * reporting an internal error. `code` says what kind of refusal it is:
 * `service_invalid_value` when the arguments are wrong, and
 * `service_not_allowed` when the caller may not do this now. A `reason` says
 * which case it is, for a caller that has to answer each case differently and
 * must not read the message to tell. It travels in the code, after the kind.
 */
export class Refusal extends RemoteServiceError {
  constructor(message: string, code: RemoteServiceErrorCode = "service_invalid_value", reason?: string) {
    // The code is typed as Chord's fixed set, and the wire carries any string.
    super(encode(code, reason) as RemoteServiceErrorCode, message);
    this.name = "Refusal";
  }
}

export function refuse(message: string, code?: RemoteServiceErrorCode, reason?: string): never {
  throw new Refusal(message, code, reason);
}
