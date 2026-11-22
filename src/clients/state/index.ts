/**
 * What a client knows and can do, without a terminal or a page: where the
 * person is, which agents run and, while the list of agents is on show, what
 * each is working in, the rooms they are in and the channels they only read,
 * their threads, an agent's sessions, everything an agent takes part in, the
 * open thread and the work behind it, the session being watched, read back from
 * where its window starts, what is linked, the person's devices, and the things
 * a person does: pick an agent, a room, a channel they only read, a thread or a
 * session, start a thread, say something, read the status of a thread, list
 * their devices and take one back, ask for the models an agent can use and read
 * the model of a thread's session, tell the person something about what they
 * wrote, turn a thread over to the session behind it and back, go back, leave.
 * It makes no room and adds no member: that is for the commands. Everything it
 * learns comes through the client's link, as objects it holds. It must not know
 * how any of this is shown or drawn, or what a key does.
 */
export { type ClientState, createClientState } from "./client-state.ts";
export {
  agentEntries,
  agentNameOf,
  agentOfThread,
  type AgentStatus,
  type ChannelThreads,
  type DevicesStatus,
  type Farewell,
  type HomeLookup,
  type Model,
  type Notice,
  type Part,
  partsOf,
  type Place,
  readOnlyEntries,
  roomEntries,
  type RoomStatus,
  type SessionView,
  type Status,
  type ThreadView,
  type Where,
} from "./model.ts";
