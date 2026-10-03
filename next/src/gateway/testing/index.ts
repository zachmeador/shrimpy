/**
 * Test support for the gateway: a runtime directory of its own for every test,
 * a minimal program to put behind the pipe, raw HTTP requests, polling, and
 * child processes to kill. Only tests and test fixtures import this.
 */
export { startChild, stop } from "./child.ts";
export { connectEcho, type EchoClient, type EchoProgram, startEchoProgram } from "./echo.ts";
export { handshakeStatus, type RawResponse, rawRequest } from "./http.ts";
export { freshRuntime } from "./runtime.ts";
export { eventually } from "./wait.ts";
