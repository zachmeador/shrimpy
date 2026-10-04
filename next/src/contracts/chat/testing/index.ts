/**
 * Test support for the chat contract: a stand-in for the chat server, scripted
 * in memory and served over a real socket, for tests of whatever talks to chat.
 * It answers as the chat server does but holds no code of it. Only tests and
 * test fixtures import this, and it must not know about any program.
 */
export { type ScriptedChat, type ScriptedChatOptions, scriptedChat } from "./scripted.ts";
export { type StandInChat, type StandInChatOptions, startStandInChat } from "./stand-in.ts";
