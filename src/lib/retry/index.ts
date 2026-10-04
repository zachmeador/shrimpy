/**
 * Keeping something going that can fail, such as a connection to another
 * program: pauses that grow, and a loop that starts the next attempt. It knows
 * nothing about what is being retried. Safe for browsers.
 */
export { type Backoff, type BackoffOptions, backoff } from "./backoff.ts";
export { type KeepRunningOptions, keepRunning } from "./keep-running.ts";
