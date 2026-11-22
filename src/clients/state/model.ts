import type {
  ModelId,
  Pigment,
  SessionActivity,
  SessionItem,
  SessionPlace,
  SessionStatus,
  SessionSummary,
  TurnFailure,
  WaitingWakeup,
} from "../../contracts/agent/index.ts";
import type { AgentCommand, Channel, Member, Message, Thread } from "../../contracts/chat/index.ts";
import type { Program, RosterEntry, WayIn } from "../../contracts/gateway/index.ts";
import type { LinkStatus, Problem } from "../network/index.ts";

/**
 * The open thread as it now stands: its newest messages, how many come before
 * them, whether the person only reads it, and how many of its messages are new
 * to them.
 */
export interface ThreadView {
  thread: Thread;
  messages: Message[];
  earlier: number;
  readOnly: boolean;
  unread: number;
}

/**
 * A session as the agent sees it: its newest items, oldest first, and the entry
 * just before the oldest of them, or null when they start at the session's
 * start; what it is doing; and whether the agent is reached now, since what a
 * session showed before its agent went away says nothing of now. The session on
 * show in place of a conversation, or behind no thread, is read back from where
 * its window starts to as many items as are shown.
 */
export interface SessionView {
  items: SessionItem[];
  before: number | null;
  status: SessionStatus;
  reached: boolean;
}

/**
 * Whose list is open, and which channel a thread is in: the person's DM with
 * an agent, by the agent's member ID, a room they are in, by its channel's ID,
 * or a channel they are not in and only read, by its channel's ID. An agent's
 * list holds every thread the agent takes part in, so a thread opened from it
 * is in whichever of these it is.
 */
export type Place = { kind: "agent"; id: string } | { kind: "room"; id: string } | { kind: "read-only"; id: string };

/** What is open in a list: a thread, or a session behind no thread. */
export type Item =
  /**
   * A thread. `thread` is undefined for a thread that is not started yet: it
   * comes to be with its first message. `place` is the channel it is in.
   * `side` is the member ID of the agent whose view of the session behind the
   * thread is on show in place of the conversation, or undefined while the
   * conversation is.
   */
  | { kind: "thread"; place: Place; thread: string | undefined; side: string | undefined }
  /** A session of the agent, by member ID, that is behind no thread, by its address at the agent. Nothing is said or done in it. */
  | { kind: "session"; agent: string; session: string };

/**
 * What is open at each level: whose list, and what in it. An agent's list is
 * everything the agent takes part in, and a room's is the room's threads.
 * Opening another list closes what was open in the one before. Which of them
 * is in front is each client's own.
 */
export interface Open {
  /** Whose list is open: none until the person opens one, or is taken to the only agent there is. */
  list: Place | undefined;
  /** What is open in that list. */
  item: Item | undefined;
}

/** A place as a string, for telling one from another. */
export const placeKey = (place: Place): string => `${place.kind} ${place.id}`;

/**
 * The member ID of the agent whose list is open, if an agent's is. A thread
 * opened from it has that agent's work beside it, and a session behind no
 * thread is that agent's.
 */
export function agentOfList(open: Open): string | undefined {
  return open.list?.kind === "agent" ? open.list.id : undefined;
}

/**
 * The session on show whole, which is read back from where its window starts:
 * the open session behind no thread, or the one behind the open thread that is
 * on show in place of its conversation. By its agent's member ID and its
 * address at the agent.
 */
export function wholeSession(open: Open): { agent: string; address: string } | undefined {
  const { item } = open;
  if (item?.kind === "session") return { agent: item.agent, address: item.session };
  if (item?.kind === "thread" && item.side !== undefined && item.thread !== undefined) return { agent: item.side, address: item.thread };
  return undefined;
}

/**
 * The agents whose view of the session behind the open thread can be on show
 * in place of its conversation, by member ID, in the order they are put on
 * show: the agent whose list the thread was opened from first, then the others
 * by name. An agent has a view of it once it has a session there.
 */
export function sidesOf(model: Pick<Model, "open" | "behind" | "listing" | "dms">): string[] {
  const { item } = model.open;
  if (item?.kind !== "thread" || item.thread === undefined) return [];
  const from = agentOfList(model.open);
  const name = (id: string): string => agentNameOf(model, id);
  return Object.keys(model.behind).sort((a, b) => Number(b === from) - Number(a === from) || name(a).localeCompare(name(b)));
}

/**
 * The side of the open thread to put on show after the one on show now: the
 * next agent in `sidesOf`, and after the last, the conversation, which is also
 * what follows a view whose session has gone.
 */
export function nextSide(model: Pick<Model, "open" | "behind" | "listing" | "dms">): string | undefined {
  const { item } = model.open;
  if (item?.kind !== "thread") return undefined;
  const sides = sidesOf(model);
  const at = item.side === undefined ? -1 : sides.indexOf(item.side);
  return item.side !== undefined && at === -1 ? undefined : sides[at + 1];
}

/** The current name of the agent with member ID `id`, from the roster or its DM, falling back to `id`. */
export function agentNameOf(model: Pick<Model, "listing" | "dms">, id: string): string {
  const onRoster = model.listing?.members.find((member) => member.id === id);
  if (onRoster !== undefined) return onRoster.name;
  const inDm = model.dms[id]?.channel.members.find((member) => member.id === id);
  return inDm?.name ?? id;
}

/**
 * The channel a thread opened from the list `list` is in. From an agent's list
 * it is whichever channel chat says it is in: the person's DM with the agent, a
 * room they are in, or a channel they only read, such as the agent's DM with
 * another agent. From a room's list, or a channel's, it is that one.
 */
export function placeOf(model: Pick<Model, "dms" | "rooms" | "readOnly">, list: Place, thread: string): Place {
  if (list.kind !== "agent") return list;
  const has = (threads: Thread[]): boolean => threads.some((each) => each.id === thread);
  if (has(model.dms[list.id]?.threads ?? [])) return list;
  const room = Object.values(model.rooms).find((each) => has(each.threads));
  if (room !== undefined) return { kind: "room", id: room.channel.id };
  const reading = Object.values(model.readOnly).find((each) => has(each.threads));
  return reading === undefined ? list : { kind: "read-only", id: reading.channel.id };
}

/**
 * The sessions what is open needs held, at one address: for a thread, the
 * session behind it of each agent in its channel and of the agent whose list it
 * was opened from; for a session behind no thread, that session. None for a
 * thread that is not started yet.
 */
export function sessionsOpen(model: Pick<Model, "open" | "rooms" | "readOnly">): { address: string; agents: Set<string> } | undefined {
  const { item } = model.open;
  if (item?.kind === "session") return { address: item.session, agents: new Set([item.agent]) };
  if (item?.kind !== "thread" || item.thread === undefined) return undefined;
  const { place } = item;
  const channel = place.kind === "room" ? model.rooms[place.id]?.channel : place.kind === "read-only" ? model.readOnly[place.id]?.channel : undefined;
  const agents = new Set(place.kind === "agent" ? [place.id] : (channel?.members ?? []).filter((member) => member.kind === "agent").map((member) => member.id));
  const from = agentOfList(model.open);
  if (from !== undefined) agents.add(from);
  return { address: item.thread, agents };
}

/**
 * A channel as chat lists it to the person, its threads, newest first, and how
 * many messages in each are new to the person, by the thread's ID. A thread it
 * leaves out has none.
 */
export interface ChannelThreads {
  channel: Channel;
  threads: Thread[];
  unread: Record<string, number>;
}

/** How many messages are new to the person in `channel`, in all its threads. */
export const unreadIn = (channel: ChannelThreads | undefined): number =>
  Object.values(channel?.unread ?? {}).reduce((sum, count) => sum + count, 0);

/**
 * Whether this machine has a home for the agent called `agent`, which is what
 * would start it here, and where it looked. A client is handed this and
 * never looks for a home itself.
 */
export type HomeLookup = (agent: string) => { found: boolean; where: string };

/** Something that happened a moment ago that the person should know, which goes away by itself. */
export type Notice =
  | { kind: "not-sent"; problem: Problem }
  | { kind: "not-opened"; problem: Problem }
  /**
   * What was written starts with a slash and is none of the commands there are, so nothing was posted and the text
   * stays in the editor. `written` is the word it starts with, and `commands` are the ones there are, each with its slash.
   */
  | { kind: "no-command"; written: string; commands: string[] }
  /** A command that takes nothing after it was written with something after it: nothing was posted. `command` has its slash. */
  | { kind: "takes-nothing"; command: string }
  /** `/model` with nothing after it: the model the thread uses, whether it is one of its own, and the agent's default when that is known. */
  | { kind: "model-is"; model: ModelId | null; own: boolean; defaultModel: ModelId | undefined }
  /** `/model` with nothing after it in a thread the agent has no session in yet: it starts on the agent's default model, which is `defaultModel` when that is known. */
  | { kind: "model-unstarted"; defaultModel: ModelId | undefined }
  | { kind: "model-not-shown"; problem: Problem }
  /** A command that is for nobody in a room unless an agent is named before it was written first there: nothing was posted. */
  | { kind: "name-an-agent"; command: AgentCommand }
  /** `/devices` with something after it that is not how a device is taken back. `command` has its slash. */
  | { kind: "devices-usage"; command: string }
  /** A device of the person's was taken back, by its label, or its ID when it has none. */
  | { kind: "taken-back"; device: string }
  /** No device of the person's is called `written`. `devices` are the labels of those there are. */
  | { kind: "no-device"; written: string; devices: string[] }
  /** Several devices of the person's are called `written`, so it names none of them. */
  | { kind: "devices-alike"; written: string }
  | { kind: "not-taken-back"; problem: Problem };

/** An agent in its DM with the person, as `/status` found it. */
export interface AgentStatus {
  kind: "agent";
  name: string;
  /** Whether the agent is linked to the gateway. */
  running: boolean;
  /** The version of Shrimpy it runs, when it is running. */
  version: string | undefined;
  /** Whether the agent was in touch with the client, which what follows from its session needs. */
  reached: boolean;
  /** What it was doing in the thread. Undefined for a thread that is not started. */
  doing: SessionActivity | undefined;
  /**
   * What the thread's session said of itself. Undefined when the agent was not
   * reached or has no session there. `own` says that its model was given to it
   * and is not the agent's default, which `defaultModel` is when the agent was
   * asked, and it is only asked when the model is the session's own. `failure`
   * is why its last turn ended without an answer, and `wakeups` are the
   * wake-ups it waits on, the soonest first.
   */
  session:
    | {
        queued: number;
        model: SessionStatus["model"];
        own: boolean;
        defaultModel: ModelId | undefined;
        usage: SessionStatus["usage"];
        failure: TurnFailure | null;
        wakeups: WaitingWakeup[];
      }
    | undefined;
  /** How many of its other sessions were working. Undefined when it could not be asked. */
  othersWorking: number | undefined;
}

/** The agents of a room, as `/status` found them, and every wake-up they wait on in the thread, the soonest first. */
export interface RoomStatus {
  kind: "room";
  agents: { name: string; running: boolean; working: boolean }[];
  wakeups: { agent: string; wakeup: WaitingWakeup }[];
}

/** The person's devices, as `/devices` found them: each one's label, or null when it has none, and its ID. */
export interface DevicesStatus {
  kind: "devices";
  devices: { label: string | null; id: string }[];
}

/**
 * What `/status` or `/devices` read in a thread, as it stood when it was
 * asked. It is the person's alone, and it goes when they send a message or
 * leave the thread.
 */
export interface Status {
  /** When it was read, in milliseconds since the epoch. */
  at: number;
  about: AgentStatus | RoomStatus | DevicesStatus;
}

export interface Model {
  /** You, as the chat server says the gateway knows you. Unknown until the client has been let in to chat. */
  me: Member | undefined;
  open: Open;
  /** The gateway, which says what is linked and who is on the roster. */
  gateway: LinkStatus;
  /**
   * What it last said, if it has: the programs linked to it, the members, the
   * person's ways in, devices included, and the version of Shrimpy it runs.
   */
  listing: { programs: Program[]; members: RosterEntry[]; ways: WayIn[]; version: string } | undefined;
  /** The chat server, where threads live. */
  chat: LinkStatus;
  /** The agent whose list is open, once one is. */
  agent: LinkStatus | undefined;
  /** The person's DM with each agent that they have talked to, by the agent's member ID. */
  dms: Record<string, ChannelThreads>;
  /** The rooms the person is in, by their channels' IDs. */
  rooms: Record<string, ChannelThreads>;
  /** The channels the person is not in and only reads, a DM between two agents or a room of agents, by their channels' IDs. */
  readOnly: Record<string, ChannelThreads>;
  /** The live view of the open thread. */
  thread: ThreadView | undefined;
  /**
   * The live view of the session behind the open thread of each agent in its
   * channel, and of the agent whose list it was opened from, by the agent's
   * member ID, once the agent has one there.
   */
  behind: Record<string, SessionView>;
  /** The live view of the open session behind no thread. */
  watched: SessionView | undefined;
  /** The sessions of the agent whose list is open, as it lists them now and in its order. Undefined until it has. */
  sessions: SessionSummary[] | undefined;
  /**
   * How each agent that is held shows itself, by its member ID: each agent that
   * is running, and the agent whose list is open. Its sigil and pigment are
   * null where it shows none.
   */
  looks: Record<string, { sigil: string[] | null; pigment: Pigment | null }>;
  /**
   * The sessions each running agent is working in, by the agent's member ID,
   * as it lists them now. Only an agent that is reached and is working in some
   * session has an entry here.
   */
  workingSessions: Record<string, SessionSummary[]>;
  /**
   * What the agent whose list is open said when it would not list its
   * sessions: its words, which stay until it says yes or another list is open.
   */
  refusal: string | undefined;
  /**
   * What the agent said when it would not let the open session behind no
   * thread be watched: its words, which stay until it says yes or something
   * else is open.
   */
  watchRefusal: string | undefined;
  notice: Notice | undefined;
  /** What the person last asked of `/status` in the thread they are in. */
  status: Status | undefined;
  /** What this machine has homes for, when the client was told. It never changes. */
  homes: HomeLookup | undefined;
}

/** An agent as the list of agents shows it. */
export interface AgentEntry {
  /** The agent's ID in the roster, which chat knows it by. */
  id: string;
  name: string;
  /** Whether the agent is linked to the gateway now. An agent that is not is still on the roster. */
  running: boolean;
  /** The version of Shrimpy it runs, when it is running. */
  version: string | undefined;
  /** Whether it is working in any session, whether in a thread of the person's or elsewhere. */
  working: boolean;
  /** How many sessions it is working in. */
  sessions: number;
  /** The sessions it is working in that are none of the person's threads with it, as it lists them. Empty when it said none or was not asked. */
  elsewhere: SessionSummary[];
  /** How many messages are new to the person in their DM with it. */
  unread: number;
}

/** Whether the member `agentId` is working in `thread`, going by the marks chat keeps. */
export function workingIn(thread: Thread, agentId: string): boolean {
  return thread.working.some((mark) => mark.memberId === agentId);
}

/** The sessions among `sessions` that are working and are none of the threads of `dm`, the person's DM with the agent. */
function workingElsewhere(sessions: SessionSummary[], dm: ChannelThreads | undefined): SessionSummary[] {
  const yours = new Set(dm?.threads.map((thread) => thread.id));
  return sessions.filter((session) => session.working && (session.threadId === null || !yours.has(session.threadId)));
}

/**
 * The agents on the roster, by name, running or not, with whether each is
 * working, in a thread of the person's, as chat marks, or in any session, as the
 * agent said, and in which sessions of the agent's that are none of the person's.
 */
export function agentEntries(model: Pick<Model, "listing" | "dms" | "workingSessions">): AgentEntry[] {
  const running = new Map<string, Program>();
  for (const program of model.listing?.programs ?? []) {
    if (program.kind === "agent" && program.member !== null) running.set(program.member, program);
  }
  return (model.listing?.members ?? [])
    .filter((member) => member.kind === "agent")
    .map((member) => {
      const dm = model.dms[member.id];
      const said = model.workingSessions[member.id] ?? [];
      // Chat's marks and the agent's word are two ways to learn the same thing, so a session that both name counts once.
      const working = new Set([
        ...(dm?.threads ?? []).filter((thread) => workingIn(thread, member.id)).map((thread) => thread.id),
        ...said.map((session) => session.id),
      ]);
      return {
        id: member.id,
        name: member.name,
        running: running.has(member.id),
        version: running.get(member.id)?.shrimpy,
        working: working.size > 0,
        sessions: working.size,
        elsewhere: workingElsewhere(said, dm),
        unread: unreadIn(dm),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A room as the list of agents and rooms shows it. */
export interface RoomEntry {
  /** The room's channel ID. */
  id: string;
  name: string;
  /** Its members but the person. */
  members: Member[];
  /** Whether anyone is working in a thread of the room. */
  working: boolean;
  /** How many messages are new to the person in it. */
  unread: number;
}

/** The rooms the person is in, by name. */
export function roomEntries(model: Pick<Model, "me" | "rooms">): RoomEntry[] {
  return Object.values(model.rooms)
    .map((room) => ({
      id: room.channel.id,
      name: room.channel.name,
      members: room.channel.members.filter((member) => member.id !== model.me?.id),
      working: room.threads.some((thread) => thread.working.length > 0),
      unread: unreadIn(room),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A room the person only reads, as the list of agents and rooms shows it. */
export interface ReadOnlyEntry {
  channel: Channel;
  /** Whether anyone is working in a thread of it. */
  working: boolean;
  /** How many messages are new to the person in it: in a thread they have not looked at, every message others wrote. */
  unread: number;
}

/**
 * The rooms the person only reads, in alphabetical order of their names. A DM
 * between two agents is not here: it is on the list of each of them.
 */
export function readOnlyEntries(model: Pick<Model, "readOnly">): ReadOnlyEntry[] {
  return Object.values(model.readOnly)
    .filter(({ channel }) => channel.kind === "room")
    .map((room) => ({ channel: room.channel, working: room.threads.some((thread) => thread.working.length > 0), unread: unreadIn(room) }))
    .sort((a, b) => a.channel.name.localeCompare(b.channel.name));
}

/**
 * One thing an agent takes part in, as its list has it: a thread, or a
 * session behind no thread, which is a trigger's own.
 */
export interface Part {
  /** What the state is told to open it: a thread's ID, or the address of a session behind no thread. */
  id: string;
  /** A thread opens as the conversation it is, and a session behind no thread as the agent's view of it. */
  kind: "thread" | "session";
  /** The thread as chat lists it. Undefined when chat does not, and only the agent has said it is there. */
  thread: Thread | undefined;
  /** Where it is: as chat has it when chat lists the thread, and else as the agent said. Null when neither knows. */
  place: SessionPlace | null;
  /** It is in the person's DM with the agent. */
  yours: boolean;
  /** Whether the agent is working there. */
  working: boolean;
  /** When something was last said in it, in milliseconds since the epoch. Undefined for what chat does not list, such as a session behind no thread: the agent gives no time. */
  at: number | undefined;
  /** How many messages in it are new to the person. None in what chat does not list. */
  unread: number;
}

/** Where a thread of `channel` is, for the agent `agentId`, as the agent says a session's place. */
function placeIn(channel: Channel, thread: Thread, agentId: string | undefined): SessionPlace {
  const place = { main: thread.main, name: thread.name };
  if (channel.kind === "room") return { kind: "room", room: channel.name, thread: place };
  const other = channel.members.find((member) => member.id !== agentId);
  return { kind: "dm", with: { name: other?.name ?? channel.name, kind: other?.kind ?? "person" }, thread: place };
}

/** The DM of the person with an agent, which is theirs: the other member is a person. */
const isYours = (place: SessionPlace | null): boolean => place?.kind === "dm" && place.with.kind === "person";

/**
 * Everything the agent with member ID `agentId` takes part in, newest first:
 * the threads of its DM with the person, the threads of its DMs with other
 * members, and the threads of rooms it has a session in, all as chat lists
 * them, and its sessions behind no thread. What has no time, which only a
 * session behind no thread has, comes last, in the agent's order. The agent's
 * word on which sessions it has, and whether it is working in them, is not
 * taken for true of an agent that cannot be reached now.
 */
export function partsOf(model: Model, agentId: string): Part[] {
  const dm = model.dms[agentId];
  const reached = model.agent?.state === "up";
  const listed = model.sessions ?? [];
  const sessionBehind = new Map<string, SessionSummary>();
  for (const session of listed) if (session.threadId !== null) sessionBehind.set(session.threadId, session);

  const parts: Part[] = [];
  const have = new Set<string>();
  const addThread = ({ channel, unread }: ChannelThreads, thread: Thread): void => {
    have.add(thread.id);
    const place = placeIn(channel, thread, agentId);
    parts.push({
      id: thread.id,
      kind: "thread",
      thread,
      place,
      yours: isYours(place),
      working: workingIn(thread, agentId) || (reached && sessionBehind.get(thread.id)?.working === true),
      at: thread.updatedAt,
      unread: unread[thread.id] ?? 0,
    });
  };

  if (dm !== undefined) for (const thread of dm.threads) addThread(dm, thread);
  for (const reading of Object.values(model.readOnly)) {
    if (reading.channel.kind === "dm" && reading.channel.members.some((member) => member.id === agentId)) {
      for (const thread of reading.threads) addThread(reading, thread);
    }
  }
  // What is left of the agent's sessions: a thread of a room, which chat lists, and what chat does not list.
  const rooms = [...Object.values(model.rooms), ...Object.values(model.readOnly)].filter(({ channel }) => channel.kind === "room");
  const inRoom = (threadId: string): { room: ChannelThreads; thread: Thread } | undefined => {
    for (const room of rooms) {
      const thread = room.threads.find((each) => each.id === threadId);
      if (thread !== undefined) return { room, thread };
    }
    return undefined;
  };
  for (const session of listed) {
    const { threadId } = session;
    if (threadId !== null && have.has(threadId)) continue;
    const found = threadId === null ? undefined : inRoom(threadId);
    if (found !== undefined) {
      addThread(found.room, found.thread);
      continue;
    }
    parts.push({
      id: threadId ?? session.id,
      kind: threadId === null ? "session" : "thread",
      thread: undefined,
      place: session.place,
      yours: isYours(session.place),
      working: reached && session.working,
      at: undefined,
      unread: 0,
    });
  }
  // The sort is stable, so what ties keeps the order it was found in.
  return parts.sort((a, b) => (a.at === undefined || b.at === undefined ? Number(a.at === undefined) - Number(b.at === undefined) : b.at - a.at));
}

/** Work that goes on after the client is left: the agent that is working, and the thread it is working in. */
export interface Farewell {
  agent: string;
  thread: string;
}

/**
 * The work that goes on if the client is left now, if there is any. Of the
 * agent whose list is open, the thread open in it comes first; then, for each
 * agent, the newest of the person's threads that it is working in.
 */
export function farewellOf(model: Model): Farewell | undefined {
  const { item } = model.open;
  const entries = agentEntries(model);
  // A thread of a room has no one agent to name, unless it was opened from an agent's list.
  const shown = agentOfList(model.open);
  const ids = [...(shown === undefined ? [] : [shown]), ...entries.map((entry) => entry.id)];
  for (const id of new Set(ids)) {
    const entry = entries.find((each) => each.id === id);
    if (entry === undefined) continue;
    // A session that was working when the agent went away is not working now, whatever its last view says.
    const behind = model.behind[id];
    const sessionWorking = behind?.status.busy === true && behind.reached;
    const onShow =
      item?.kind === "thread" && shown === id && item.thread !== undefined
        ? { thread: item.thread, working: sessionWorking || (model.thread !== undefined && workingIn(model.thread.thread, id)) }
        : undefined;
    if (onShow?.working === true) return { agent: entry.name, thread: onShow.thread };
    const working = model.dms[id]?.threads.find((each) => workingIn(each, id));
    if (working !== undefined) return { agent: entry.name, thread: working.id };
  }
  return undefined;
}
