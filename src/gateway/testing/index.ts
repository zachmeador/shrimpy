/**
 * Test support for the gateway: a gateway to start in the test, a minimal
 * program and a plain socket to put behind the pipe, raw HTTP requests, and
 * child processes to kill. Only tests and test fixtures import this, and it
 * must not know about any other program.
 */
export { type BytesTarget, canConnect, startBytesTarget } from "./bytes.ts";
export { startGatewayChild, startRegistrantChild } from "./child.ts";
export { connectEcho, type EchoClient, type EchoProgram, startEchoProgram } from "./echo.ts";
export { agentUrl, openEntry } from "./entry.ts";
export {
  agentAnnouncement,
  connectApart,
  entryOf,
  joinAndRegister,
  LOOPBACK,
  webPortOf,
} from "./fixtures.ts";
export { startGatewayInProcess } from "./gateway.ts";
export { handshakeStatus, type RawResponse, rawRequest } from "./http.ts";
