/**
 * Test support for the gateway: the gateway started in the test's own process,
 * with a data directory and a runtime directory of its own, and any option a
 * gateway takes. Only tests import this.
 */
export { type GatewayInProcess, type GatewayInProcessOptions, startGatewayInProcess } from "./gateway.ts";
