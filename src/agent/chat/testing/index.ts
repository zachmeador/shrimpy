/**
 * Test support for chat: the agent's way to chat and a delivery over it,
 * wired to the real chat server with a person to talk to it, and a way to
 * make things go wrong between them. Only tests and test fixtures import this,
 * and it must not know the engine.
 */
export { type ChatRig, type Faults, startChatRig } from "./rig.ts";
