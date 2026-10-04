/**
 * Test support for the gateway contract: a stand-in for the gateway that keeps
 * the registrations it is sent, for tests of whatever registers with it. Only
 * tests and test fixtures import this, and it must not know about any program.
 */
export { type StandInGateway, type StandInGatewayOptions, startStandInGateway } from "./gateway.ts";
