import type {
  ModelId,
  SessionActivity,
  SessionPlace,
  SessionStatus,
  SessionSummary,
  SessionView,
} from "../../../contracts/agent/index.ts";
import type { AgentCommand, Channel, Member, Thread, ThreadView } from "../../../contracts/chat/index.ts";
import type { Registration, RosterEntry } from "../../../contracts/gateway/index.ts";
import type { LinkStatus, Problem } from "../network/index.ts";

/**
 * Whose threads the person looks at, and which channel a thread is in: their DM
 * with an agent, by the agent's name, a room they are in, by its channel's ID,
 * or a channel they are not in and only read, by its channel's ID. An agent's
 * screen lists every thread the agent takes part in, so a thread opened from it
 * is in whichever of these it is.
 */
export type Place = { kind: "agent"; name: string } | { kind: "room"; id: string } | { kind: "read-only"; id: string };

/**
 * Where in the console the person is. An agent's screen is one list of
 * everything the agent takes part in, and a room's is the room's threads.
 */
export type Where =
  | { screen: "agents" }
  | { screen: "threads"; place: Place }
  /**
   * `thread` is undefined for a thread that is not started yet: it comes to be
   * with its first message. `place` is the channel the thread is in. `agent` is
   * the agent whose screen the thread was opened from, said only when `place`
   * does not say it: that agent's work is shown beside the thread, and Esc goes
   * back to its screen. `turned` shows the session behind the thread as that
   * agent sees it, in place of the conversation.
   */
  | { screen: "thread"; place: Place; thread: string | undefined; agent?: string; turned?: boolean }
  /** One session of that agent that is behind no thread, watched, by its address at the agent. Nothing is said or done in it. */
  | { screen: "session"; agent: string; session: string };

type ThreadWhere = Extract<Where, { screen: "thread" }>;

/** The agent whose screen a thread was opened from, whose work is shown beside it. A room's own threads have none. */
export function agentOfThread(where: ThreadWhere): string | undefined {
  return where.place.kind === "agent" ? where.place.name : where.agent;
}

/**
 * The list that a thread or a session goes back to: the screen of the agent it
 * was opened from, or else the threads of the channel it is in.
 */
export function listedIn(where: Extract<Where, { screen: "thread" | "session" }>): Place {
  if (where.screen === "session") return { kind: "agent", name: where.agent };
  const agent = agentOfThread(where);
  return agent === undefined ? where.place : { kind: "agent", name: agent };
}

/** The name of the agent whose screen, or whose thread or session, is on show, if the person is looking at an agent's. */
export function agentLookedAt(where: Where): string | undefined {
  switch (where.screen) {
    case "agents":
      return undefined;
    case "threads":
      return where.place.kind === "agent" ? where.place.name : undefined;
    case "thread":
      return agentOfThread(where);
    case "session":
      return where.agent;
  }
}

/**
 * The thread screen for opening `thread` from the screen `from`, or for starting
 * a new one there when it is undefined. From an agent's screen a thread is in
 * whichever channel chat says it is in: the person's DM with the agent, a room
 * they are in, or a channel they only read, such as the agent's DM with another
 * agent. From a room's list, or from inside a thread, it is where that is.
 */
export function openedThread(
  model: Pick<Model, "dms" | "rooms" | "readOnly">,
  from: Extract<Where, { screen: "threads" | "thread" }>,
  thread: string | undefined,
): Where {
  const at = (place: Place, openedBy: string | undefined): Where =>
    openedBy === undefined || place.kind === "agent" ? { screen: "thread", place, thread } : { screen: "thread", place, thread, agent: openedBy };
  if (from.screen === "thread") return at(from.place, agentOfThread(from));
  const { place } = from;
  if (place.kind !== "agent" || thread === undefined) return at(place, undefined);
  const has = (threads: Thread[]): boolean => threads.some((each) => each.id === thread);
  if (has(model.dms[place.name]?.threads ?? [])) return at(place, undefined);
  const room = Object.values(model.rooms).find((each) => has(each.threads));
  if (room !== undefined) return at({ kind: "room", id: room.channel.id }, place.name);
  const reading = Object.values(model.readOnly).find((each) => has(each.threads));
  return reading === undefined ? at(place, undefined) : at({ kind: "read-only", id: reading.channel.id }, place.name);
}

/** The person's DM with an agent, and their threads in it, newest first. */
export interface Dm {
  channel: Channel;
  threads: Thread[];
}

/** A room the person is in, and its threads, newest first. */
export interface Room {
  channel: Channel;
  threads: Thread[];
}

/** A channel the person is not in and only reads, a DM between two agents or a room of agents, and its threads, newest first. */
export interface ReadOnlyChannel {
  channel: Channel;
  threads: Thread[];
}

/**
 * Whether this machine has a home for the agent called `agent`, which is what
 * would start it here, and where it looked. The console is handed this and
 * never looks for a home itself.
 */
export type HomeLookup = (agent: string) => { found: boolean; where: string };

/** Something that happened a moment ago that the person should know, which goes away by itself. */
export type Notice =
  | { kind: "not-sent"; problem: Problem }
  | { kind: "not-opened"; problem: Problem }
  | { kind: "not-watched"; problem: Problem }
  | { kind: "not-listed"; problem: Problem }
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
  | { kind: "name-an-agent"; command: AgentCommand };

/** An agent in its DM with the person, as `/status` found it. */
export interface AgentStatus {
  kind: "agent";
  name: string;
  /** Whether the agent is registered with the gateway. */
  running: boolean;
  /** The version of Shrimpy it runs, when it is running. */
  version: string | undefined;
  /** Whether the agent was in touch with the console, which what follows from its session needs. */
  reached: boolean;
  /** What it was doing in the thread. Undefined for a thread that is not started. */
  doing: SessionActivity | undefined;
  /**
   * What the thread's session said of itself. Undefined when the agent was not
   * reached or has no session there. `own` says that its model was given to it
   * and is not the agent's default, which `defaultModel` is when the agent was
   * asked, and it is only asked when the model is the session's own.
   */
  session:
    | {
        queued: number;
        model: SessionStatus["model"];
        own: boolean;
        defaultModel: ModelId | undefined;
        usage: SessionStatus["usage"];
      }
    | undefined;
  /** How many of its other sessions were working. Undefined when it could not be asked. */
  othersWorking: number | undefined;
}

/** The agents of a room, as `/status` found them. */
export interface RoomStatus {
  kind: "room";
  agents: { name: string; running: boolean; working: boolean }[];
}

/**
 * What `/status` read in a thread, as it stood when it was asked. It is the
 * person's alone, and it goes when they send a message or leave the thread.
 */
export interface Status {
  /** When it was read, in milliseconds since the epoch. */
  at: number;
  about: AgentStatus | RoomStatus;
}

export interface Model {
  /** You, as the chat server says the gateway knows you. Unknown until the console has been let in to chat. */
  me: Member | undefined;
  where: Where;
  /** The gateway, which says what is running and who is on the roster. */
  gateway: LinkStatus;
  /** What it last said, if it has: the programs running, the members, and the version of Shrimpy it runs. */
  listing: { programs: Registration[]; members: RosterEntry[]; version: string } | undefined;
  /** The chat server, where threads live. */
  chat: LinkStatus;
  /** The agent that is selected, once one is. */
  agent: LinkStatus | undefined;
  /** The person's DM with each agent that is running and that they have talked to, by the agent's name. */
  dms: Record<string, Dm>;
  /** The rooms the person is in, by their channels' IDs. */
  rooms: Record<string, Room>;
  /** The channels the person is not in and only reads, by their channels' IDs. */
  readOnly: Record<string, ReadOnlyChannel>;
  /** The live view of the open thread. */
  thread: ThreadView | undefined;
  /** The live view of the session on show: the one behind the open thread, once the agent has one, or the one being watched. */
  session: SessionView | undefined;
  /** The sessions of the agent that is selected, as it last listed them and in its order. Undefined until it has. */
  sessions: SessionSummary[] | undefined;
  /**
   * The sessions each running agent said it is working in, by the agent's name,
   * as it listed them, the last time the list of agents asked. Only an agent that
   * answered, is reached and is working in some session has an entry here.
   */
  workingSessions: Record<string, SessionSummary[]>;
  /**
   * What the agent said when it would not list its sessions or let the one being
   * watched be watched: its words, which stay until it says yes or the person
   * goes elsewhere.
   */
  refusal: string | undefined;
  notice: Notice | undefined;
  /** What the person last asked of `/status` in the thread they are in. */
  status: Status | undefined;
  /** What this machine has homes for, when the console was told. It never changes. */
  homes: HomeLookup | undefined;
}

/** An agent as the list of agents shows it. */
export interface AgentEntry {
  /** The agent's ID in the roster, which chat knows it by. */
  id: string;
  name: string;
  /** Whether the agent is registered with the gateway now. An agent that is not is still on the roster. */
  running: boolean;
  /** The version of Shrimpy it runs, when it is running. */
  version: string | undefined;
  /** Whether it is working in any session, whether in a thread of the person's or elsewhere. */
  working: boolean;
  /** How many sessions it is working in. */
  sessions: number;
  /** The sessions it is working in that are none of the person's threads with it, as it lists them. Empty when it said none or was not asked. */
  elsewhere: SessionSummary[];
}

/** Whether the member `agentId` is working in `thread`, going by the marks chat keeps. */
export function workingIn(thread: Thread, agentId: string): boolean {
  return thread.working.some((mark) => mark.memberId === agentId);
}

/** The sessions among `sessions` that are working and are none of the threads of `dm`, the person's DM with the agent. */
function workingElsewhere(sessions: SessionSummary[], dm: Dm | undefined): SessionSummary[] {
  const yours = new Set(dm?.threads.map((thread) => thread.id));
  return sessions.filter((session) => session.working && (session.threadId === null || !yours.has(session.threadId)));
}

/**
 * The agents on the roster, by name, running or not, with whether each is
 * working, in a thread of the person's, as chat marks, or in any session, as the
 * agent said, and in which sessions of the agent's that are none of the person's.
 */
export function agentEntries(model: Pick<Model, "listing" | "dms" | "workingSessions">): AgentEntry[] {
  const running = new Map<string, Registration>();
  for (const program of model.listing?.programs ?? []) {
    if (program.kind === "agent" && program.memberId !== null) running.set(program.memberId, program);
  }
  return (model.listing?.members ?? [])
    .filter((member) => member.kind === "agent")
    .map((member) => {
      const dm = model.dms[member.name];
      const said = model.workingSessions[member.name] ?? [];
      // Chat's marks and the agent's word are two ways to learn the same thing, so a session that both name counts once.
      const working = new Set([
        ...(dm?.threads ?? []).filter((thread) => workingIn(thread, member.id)).map((thread) => thread.id),
        ...said.map((session) => session.id),
      ]);
      return {
        id: member.id,
        name: member.name,
        running: running.has(member.id),
        version: running.get(member.id)?.version,
        working: working.size > 0,
        sessions: working.size,
        elsewhere: workingElsewhere(said, dm),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A room as the list of agents and rooms shows it. */
export interface RoomEntry {
  /** The room's channel ID. */
  id: string;
  name: string;
  /** The names of its members but the person's own, in alphabetical order. */
  members: string[];
  /** Whether anyone is working in a thread of the room. */
  working: boolean;
}

/** The rooms the person is in, by name. */
export function roomEntries(model: Pick<Model, "me" | "rooms">): RoomEntry[] {
  return Object.values(model.rooms)
    .map(({ channel, threads }) => ({
      id: channel.id,
      name: channel.name,
      members: channel.members
        .filter((member) => member.id !== model.me?.id)
        .map((member) => member.name)
        .sort((a, b) => a.localeCompare(b)),
      working: threads.some((thread) => thread.working.length > 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A room the person only reads, as the list of agents and rooms shows it. */
export interface ReadOnlyEntry {
  channel: Channel;
  /** Whether anyone is working in a thread of it. */
  working: boolean;
}

/**
 * The rooms the person only reads, in alphabetical order of their names. A DM
 * between two agents is not here: it is on the screen of each of them.
 */
export function readOnlyEntries(model: Pick<Model, "readOnly">): ReadOnlyEntry[] {
  return Object.values(model.readOnly)
    .filter(({ channel }) => channel.kind === "room")
    .map(({ channel, threads }) => ({ channel, working: threads.some((thread) => thread.working.length > 0) }))
    .sort((a, b) => a.channel.name.localeCompare(b.channel.name));
}

/**
 * One thing an agent takes part in, as its screen lists it: a thread, or a
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
 * Everything the agent called `agent` takes part in, newest first: the threads
 * of its DM with the person, the threads of its DMs with other members, and the
 * threads of rooms it has a session in, all as chat lists them, and its sessions
 * behind no thread. What has no time, which only a session behind no thread
 * has, comes last, in the agent's order. The agent's word on which sessions it
 * has, and whether it is working in them, is not taken for true of an agent that
 * cannot be reached now.
 */
export function partsOf(model: Model, agent: string): Part[] {
  const dm = model.dms[agent];
  const agentId = agentEntries(model).find((entry) => entry.name === agent)?.id ?? dm?.channel.members.find((member) => member.kind === "agent")?.id;
  const reached = model.agent?.state === "up";
  const listed = model.sessions ?? [];
  const sessionBehind = new Map<string, SessionSummary>();
  for (const session of listed) if (session.threadId !== null) sessionBehind.set(session.threadId, session);

  const parts: Part[] = [];
  const have = new Set<string>();
  const addThread = (channel: Channel, thread: Thread): void => {
    have.add(thread.id);
    const place = placeIn(channel, thread, agentId);
    parts.push({
      id: thread.id,
      kind: "thread",
      thread,
      place,
      yours: isYours(place),
      working: (agentId !== undefined && workingIn(thread, agentId)) || (reached && sessionBehind.get(thread.id)?.working === true),
      at: thread.updatedAt,
    });
  };

  if (dm !== undefined) for (const thread of dm.threads) addThread(dm.channel, thread);
  for (const { channel, threads } of Object.values(model.readOnly)) {
    if (channel.kind === "dm" && agentId !== undefined && channel.members.some((member) => member.id === agentId)) {
      for (const thread of threads) addThread(channel, thread);
    }
  }
  // What is left of the agent's sessions: a thread of a room, which chat lists, and what chat does not list.
  const rooms = [...Object.values(model.rooms), ...Object.values(model.readOnly)].filter(({ channel }) => channel.kind === "room");
  const inRoom = (threadId: string): { channel: Channel; thread: Thread } | undefined => {
    for (const { channel, threads } of rooms) {
      const thread = threads.find((each) => each.id === threadId);
      if (thread !== undefined) return { channel, thread };
    }
    return undefined;
  };
  for (const session of listed) {
    const { threadId } = session;
    if (threadId !== null && have.has(threadId)) continue;
    const found = threadId === null ? undefined : inRoom(threadId);
    if (found !== undefined) {
      addThread(found.channel, found.thread);
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
    });
  }
  // The sort is stable, so what ties keeps the order it was found in.
  return parts.sort((a, b) => (a.at === undefined || b.at === undefined ? Number(a.at === undefined) - Number(b.at === undefined) : b.at - a.at));
}

/** Work that goes on after the console is left: the agent that is working, and the thread it is working in. */
export interface Farewell {
  agent: string;
  thread: string;
}

export type SendResult = { ok: true } | { ok: false };
