/**
 * Telling a person that the command they are running is newer than the
 * gateway it reached. The gateway's machine updates first, so that is reported
 * on standard error, and the command carries on. It must not know how a
 * command reaches the gateway.
 */
export { warnIfNewerThanGateway } from "./versions.ts";
