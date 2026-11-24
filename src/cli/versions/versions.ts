import { newerThanGateway } from "../../contracts/gateway/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import type { Io } from "../io/index.ts";

/**
 * Warn on standard error when this command runs a newer Shrimpy than the
 * gateway, whose version is `gateway`. It never refuses anything.
 */
export function warnIfNewerThanGateway(io: Io, gateway: string): void {
  const warning = newerThanGateway("this command", SHRIMPY_VERSION, gateway);
  if (warning !== undefined) io.err(warning);
}
