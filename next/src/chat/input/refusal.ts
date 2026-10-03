import { RemoteServiceError, type RemoteServiceErrorCode } from "@earendil-works/chord";

/**
 * A call the chat server will not carry out. It is a Chord service error, so
 * the server passes its message to the caller exactly as written here instead
 * of reporting an internal error.
 */
export class Refusal extends RemoteServiceError {
  constructor(message: string, code: RemoteServiceErrorCode = "service_invalid_value") {
    super(code, message);
    this.name = "Refusal";
  }
}

export function refuse(message: string, code?: RemoteServiceErrorCode): never {
  throw new Refusal(message, code);
}
