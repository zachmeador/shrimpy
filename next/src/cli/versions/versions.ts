import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
import type { Io } from "../io/index.ts";

/**
 * Warn on standard error when `version`, the version of Shrimpy that `what`
 * runs, is not the version of this command. It never refuses anything.
 */
export function warnIfVersionDiffers(io: Io, what: string, version: string): void {
  if (version === SHRIMPY_VERSION) return;
  io.err(
    `Warning: ${what} runs Shrimpy ${version}, but this command is ${SHRIMPY_VERSION}. ` +
      "Programs are meant to be upgraded together.",
  );
}
