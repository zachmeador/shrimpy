/**
 * Test support for the chat server: temporary stores and a chat server in the
 * test's own process that clean up after themselves, the real gateway to reach
 * chat through, you and agents to talk as, and a method's answer read as what it
 * did or what it refused. Only tests and test fixtures import this, and it must
 * not know about any other program.
 */
export { valueOf } from "../../contracts/chat/testing/index.ts";
export { refusalOf } from "./answers.ts";
export { startChatInProcess } from "./chat.ts";
export { openTestDeps } from "./deps.ts";
export { agent, outcome, person } from "./fixtures.ts";
export { openTestStore } from "./store.ts";
