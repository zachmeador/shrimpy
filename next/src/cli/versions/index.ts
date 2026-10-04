/**
 * Telling a person that a program they are talking to was not built together
 * with the command they are running. Programs upgrade together, so a mismatch
 * is reported on standard error, and the command carries on. It must not know
 * how a command reaches a program or where its version comes from.
 */
export { warnIfVersionDiffers } from "./versions.ts";
