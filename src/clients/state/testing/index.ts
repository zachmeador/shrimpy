/**
 * Test support for a client's state: models written down by hand, and a
 * state that only remembers what it was asked, for tests of what is shown and
 * what keys do; and the real gateway and chat server, with small agents'
 * programs linked to the gateway and a client's state holding what they serve,
 * for tests of what is done. Only tests and test fixtures import this, and it
 * must not know how anything is drawn.
 */
export {
  aChatServer,
  aDm,
  agentMember,
  aListing,
  aMessage,
  aModel,
  anAgent,
  aReceipt,
  aRoom,
  aSession,
  aThread,
  aThreadView,
  onSession,
  onThread,
  sessionView,
  workingView,
  zach,
} from "./data.ts";
export { type FakeState, fakeState } from "./fake.ts";
export { type Rig, startRig } from "./rig.ts";
