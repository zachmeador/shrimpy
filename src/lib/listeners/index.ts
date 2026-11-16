/**
 * Telling several listeners about a value without letting one that fails
 * affect the rest, and waiting until something is heard or a stop comes. It
 * must not know what the values are or who listens. Safe for browsers.
 */
export { createListeners, type Listeners } from "./listeners.ts";
export { untilAborted, untilHeard } from "./wait.ts";
