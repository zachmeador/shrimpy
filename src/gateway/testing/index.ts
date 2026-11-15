/**
 * Test support for the gateway: the gateway started in the test's own process,
 * with a data directory and a runtime directory of its own; a small agent that
 * links out to it and serves its presence and `Echo`, which shows whom a
 * request reached it as; and a client linked in. Only tests import this.
 */
export { Echo, type TestAgent, type TestAgentOptions, startTestAgent } from "./agent.ts";
export { connectTestClient, startTestGateway, type TestGateway, type TestGatewayOptions } from "./gateway.ts";
