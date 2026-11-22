/**
 * Test support for the gateway's contract: the real gateway, started through
 * the command in a process of its own, for tests of whatever links to it, and
 * settings that give any gateway's page door a port of its own; a
 * client linked to a gateway; and a small agent's program linked to it, which
 * serves its presence and `Echo`, which shows whom a request reached it as, so a
 * test has agents on the roster, and that program's host alone, for a stand-in
 * that links its own way; and a push service a test stands in for, with
 * browsers of yours that the page's door lets in and subscribes there, reading
 * what reaches them as a browser does. Only tests and test fixtures import
 * this, and it must not know about any program but the command that starts
 * one.
 */
export { Echo, linkTestAgent, type TestAgent, testAgentHost } from "./agent.ts";
export { connectTestClient, pagePortOfItsOwn, SHRIMPY_ENTRY, startTestGateway, type TestGateway } from "./gateway.ts";
export {
  askPage,
  type PageAnswer,
  type PageAsking,
  readPushMessage,
  startTestPushService,
  type TestBrowser,
  type TestPushService,
} from "./push.ts";
