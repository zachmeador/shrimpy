/**
 * Test support for the gateway's contract: the real gateway, started through
 * the command in a process of its own, for tests of whatever links to it, and a
 * small agent's program linked to it, so a test has agents on the roster. Only
 * tests and test fixtures import this, and it must not know about any program
 * but the command that starts the gateway.
 */
export { linkTestAgent, type TestAgent } from "./agent.ts";
export { startTestGateway, type TestGateway, type TestGatewayOptions } from "./real.ts";
