import { versionWarning } from "../../contracts/gateway/index.ts";
import type { Io } from "../io/index.ts";

/**
 * Warn on standard error when `version`, the version of Shrimpy that `what`
 * runs, is not the version of this command. It never refuses anything.
 */
export function warnIfVersionDiffers(io: Io, what: string, version: string): void {
  const warning = versionWarning(what, version, "this command");
  if (warning !== undefined) io.err(warning);
}
