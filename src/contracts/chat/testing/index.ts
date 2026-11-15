/**
 * Test support for the chat contract: a member of chat as a test speaks for
 * it, over any host that holds chat's objects, you linked to the test's
 * gateway or an agent's program, with each call answering what it did or
 * failing with what chat refused; and the roster's member a name means. Only
 * tests and test fixtures import this, and it must not know about any program.
 */
export {
  enterAsAgent,
  enterAsPerson,
  type Holder,
  joinRoster,
  memberNamed,
  type Speaking,
  speakingAs,
  valueOf,
} from "./speaking.ts";
