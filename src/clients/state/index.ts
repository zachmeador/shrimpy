/**
 * What a client knows and can do, without a terminal or a page: what is open at
 * each level, which is whose list, an agent's or a room's, and which thread in
 * it, with whose side of a thread is on show; which agents run and what each is
 * working in, running in the background, waiting on, or has scheduled, and how
 * each shows itself; the rooms the person is in and the channels they only read,
 * their threads and how many messages in each are new to the person; an agent's
 * sessions and triggers; everything an agent takes part in; the open thread and
 * the session behind it of each agent in it; what is linked; the person's
 * devices; and the things a person does, sending files and reading them back
 * among them. Everything it learns comes through the
 * client's link, as objects it holds. It must not know how any of this is shown
 * or drawn, or what a key does.
 */
export { type ClientState, createClientState, type Fetched } from "./client-state.ts";
export { notAttachable } from "./sending.ts";
export {
  type AgentEntry,
  agentEntries,
  agentNameOf,
  agentOfList,
  type AgentRead,
  agentRuns,
  type AgentStatus,
  type ChannelThreads,
  type DevicesStatus,
  type Farewell,
  findChannelThread,
  gatewayAhead,
  type HomeLookup,
  type HomeRead,
  type Item,
  type Model,
  NOTHING_READ,
  type Notice,
  onceTriggersIn,
  onceTriggersOf,
  type Open,
  openThreadOf,
  type Part,
  partsOf,
  type Place,
  placeKey,
  placeOfThread,
  processesIn,
  processesOf,
  processOutputKey,
  readOnlyEntries,
  roomEntries,
  type RoomStatus,
  type SessionView,
  sidesOf,
  standingTriggersIn,
  type Status,
  type StatusWatch,
  type StillFlags,
  stillFlagsIn,
  threadReferenceLabel,
  type ThreadView,
  triggerFile,
  triggersOf,
  turnedAwayBehind,
  unreadOf,
  waitsOnThread,
  watchesIn,
  watchesOf,
} from "./model.ts";
export { type ClientCommand, CLIENT_COMMANDS, commandNames, type Standing, standingOf, type Written, writtenInOpen } from "./written.ts";
