/**
 * What the console knows and can do, without a terminal: where the person is,
 * which agents run, the rooms they are in, their threads, the open thread and
 * the work behind it, what is connected, and the things a person does: pick an
 * agent, a room or a thread, start one, say something, stop the work, go back,
 * leave. It makes no room and adds no member: that is for the commands.
 * Everything it learns comes through the console's links. It must not know how
 * any of this is shown or drawn, or what a key does.
 */
export { type ConsoleState, type ConsoleStateOptions, createConsoleState } from "./store.ts";
export {
  type AgentEntry,
  agentEntries,
  type Dm,
  type Farewell,
  type Model,
  type Notice,
  type Place,
  type Room,
  type RoomEntry,
  roomEntries,
  type SendResult,
  type Where,
  workingIn,
  workingInOpenThread,
} from "./model.ts";
