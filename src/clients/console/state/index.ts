/**
 * What the console knows and can do, without a terminal: where the person is,
 * which agents run, the rooms they are in, their threads, an agent's sessions,
 * the open thread and the work behind it, the session being watched, what is
 * connected, and the things a person does: pick an agent, a room, a thread or a
 * session, start a thread, say something, stop the work, switch between an
 * agent's threads and its sessions, go back, leave. It makes no room and adds
 * no member: that is for the commands. Everything it learns comes through the
 * console's links. It must not know how any of this is shown or drawn, or what
 * a key does.
 */
export { type ConsoleState, type ConsoleStateOptions, createConsoleState } from "./store.ts";
export {
  type AgentEntry,
  agentEntries,
  agentLookedAt,
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
