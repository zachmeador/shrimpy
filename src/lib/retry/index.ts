/**
 * Keeping something going that can fail, such as a connection to another
 * program: pauses that grow and that a stop cuts short, and a loop that starts
 * the next attempt. It knows nothing about what is being retried. Safe for
 * browsers.
 */
export { type Backoff, backoff } from "./backoff.ts";
export { keepRunning, pause } from "./keep-running.ts";
