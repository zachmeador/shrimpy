import { refuse } from "../../../lib/refusal/index.ts";
import type { Gateway } from "../index.ts";

/** A `Gateway` that answers the calls a test gives it and refuses every other. */
export function gatewayThatDoes(calls: Partial<Gateway>): Gateway {
  const unsupported = (): never => refuse("The stand-in gateway does not do this.");
  return {
    register: unsupported,
    list: unsupported,
    version: unsupported,
    join: unsupported,
    signIn: unsupported,
    members: unsupported,
    ticket: unsupported,
    redeem: unsupported,
    ...calls,
  };
}
