/**
 * Test support for the gateway: a runtime directory of its own for every test,
 * polling, and child processes to kill. Only tests and test fixtures import
 * this.
 */
export { startChild, stop } from "./child.ts";
export { freshRuntime } from "./runtime.ts";
export { eventually } from "./wait.ts";
