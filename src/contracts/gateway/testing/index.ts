/**
 * Test support for the gateway contract: the real gateway, started through the
 * command in a process of its own, for tests of whatever talks to it, and a
 * `Gateway` that answers only the calls a test gives it, for a test of a
 * gateway that says no. Only tests and test fixtures import this, and it must
 * not know about any program but the command that starts the gateway.
 */
export { gatewayThatDoes } from "./partial.ts";
export { startTestGateway, type TestGateway } from "./real.ts";
