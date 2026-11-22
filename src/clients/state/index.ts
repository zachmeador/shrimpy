/**
 * What a client knows and can do, without a terminal or a page: what is open at
 * each level, which is whose list, an agent's or a room's, and which thread or
 * session in it, with whose side of a thread is on show; which agents run and
 * what each is working in and how each shows itself, the rooms the person is in
 * and the channels they only read, their threads and how many messages in each
 * are new to the person, an agent's sessions, everything an agent takes part
 * in, the open thread and the session behind it of each agent in it, the
 * session on show whole, read back from where its window starts, what is
 * linked, the person's devices, and the things a person does: open an agent's
 * list, a room's or a channel's they only read, a thread or a session, start a
 * thread, say something, read the status of a thread, list their devices and
 * take one back, ask for the models an agent can use and read the model of a
 * thread's session, tell the person something about what they wrote, put an
 * agent's view of a thread on show and back, leave. A client says whether the
 * person is looking, and the thread they look at is marked read. Which level is
 * in front, and going back, are each client's own. It makes no room and adds no
 * member: that is for the commands. Everything it learns comes through the
 * client's link, as objects it holds. It must not know how any of this is shown
 * or drawn, or what a key does.
 */
export { type ClientState, createClientState } from "./client-state.ts";
export {
  agentEntries,
  agentNameOf,
  agentOfList,
  type AgentStatus,
  type ChannelThreads,
  type DevicesStatus,
  type Farewell,
  type HomeLookup,
  type Item,
  type Model,
  type Notice,
  type Open,
  type Part,
  partsOf,
  type Place,
  readOnlyEntries,
  roomEntries,
  type RoomStatus,
  type SessionView,
  type Status,
  type ThreadView,
} from "./model.ts";
