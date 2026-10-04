/**
 * Test support for the chat contract: a stand-in for the chat server, scripted
 * in memory and served over a real socket, for the tests of the console, which
 * watch threads and talk in them, and ways to come in to a chat server as the
 * person who runs the gateway or as an agent, with tickets from the real
 * gateway. The stand-in holds only what the console needs, and none of the chat
 * server's code. Tests of whatever else talks to chat run the chat server
 * itself. Only tests and test fixtures import this, and it must not know about
 * any program.
 */
export {
  type Entered,
  enterAsAgent,
  enterAsPerson,
  gatewayAsAgent,
  joinRoster,
  memberNamed,
  renameAgent,
  ticketForPerson,
} from "./enter.ts";
export { type ScriptedChat, type ScriptedChatOptions, type ScriptedIdentity, scriptedChat } from "./scripted.ts";
export { type StandInChat, type StandInChatOptions, startStandInChat } from "./stand-in.ts";
