/**
 * Test support for the chat server: temporary stores and servers that clean up
 * after themselves, the real gateway to reach chat through, you and agents to
 * talk as, and a method's answer read as what it did or what it refused. Only
 * tests and test fixtures import this, and it must not know about any other
 * program.
 */
export { refusalOf, valueOf } from "./answers.ts";
export { startTestChat, type TestChat } from "./chat.ts";
export { openTestDeps } from "./deps.ts";
export { agent, type Clock, fakeClock, outcome, person } from "./fixtures.ts";
export { openTestStore } from "./store.ts";
