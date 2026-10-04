/**
 * Test support for the console's state: models written down by hand, and a
 * state that only remembers what it was asked, for tests of what is shown and
 * what keys do; and a gateway, a chat server and agents as stand-ins on real
 * sockets with a console state talking to them, for tests of what is done. Only
 * tests and test fixtures import this, and it must not know how anything is
 * drawn.
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
  aRosterAgent,
  aThread,
  aThreadView,
  onThread,
  zach,
} from "./data.ts";
export { type FakeState, fakeState } from "./fake.ts";
export { type Rig, type RigOptions, startRig } from "./rig.ts";
