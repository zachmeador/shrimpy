/**
 * Test support for the chat server: temporary stores and servers that clean up
 * after themselves, and members to talk as. Only tests and test fixtures import
 * this, and it must not know about any other program.
 */
export { startTestChat, type TestChat } from "./chat.ts";
export { type ChatChild, joinEndpoint, startChatChild } from "./child.ts";
export { openTestDeps, openTestDm } from "./deps.ts";
export { agent, type Clock, fakeClock, outcome, person, refused } from "./fixtures.ts";
export { openTestStore } from "./store.ts";
export { mainThread, readAll, startDm, texts } from "./talk.ts";
export { countWatchers, follow, type Outcome } from "./watching.ts";
