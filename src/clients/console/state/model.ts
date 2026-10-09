import type {
  ModelId,
  SessionActivity,
  SessionStatus,
  SessionSummary,
  SessionView,
} from "../../../contracts/agent/index.ts";
import type { AgentCommand, Channel, Member, Thread, ThreadView } from "../../../contracts/chat/index.ts";
import type { Registration, RosterEntry } from "../../../contracts/gateway/index.ts";
import type { LinkStatus, Problem } from "../network/index.ts";

/**
 * Whose threads the person looks at: their DM with an agent, by the agent's
 * name, a room they are in, by its channel's ID, or a channel they are not in
 * and only read, by its channel's ID.
 */
export type Place = { kind: "agent"; name: string } | { kind: "room"; id: string } | { kind: "read-only"; id: string };

/**
 * Where in the console the person is. An agent's screen is two lists, the
 * person's threads with it and its sessions, and a room's is one.
 */
export type Where =
  | { screen: "agents" }
  | { screen: "threads"; place: Place }
  /** `thread` is undefined for a thread that is not started yet: it comes to be with its first message. */
  | { screen: "thread"; place: Place; thread: string | undefined }
  /** The sessions of the agent with this name. */
  | { screen: "sessions"; agent: string }
  /** One session of that agent, watched, by its address at the agent. Nothing is said or done in it. */
  | { screen: "session"; agent: string; session: string };

/** The name of the agent whose threads or sessions are on show, if the person is looking at an agent's. */
export function agentLookedAt(where: Where): string | undefined {
  switch (where.screen) {
    case "agents":
      return undefined;
    case "threads":
    case "thread":
      return where.place.kind === "agent" ? where.place.name : undefined;
    case "sessions":
    case "session":
      return where.agent;
  }
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
export function workingElsewhere(sessions: SessionSummary[], dm: Dm | undefined): SessionSummary[] {
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

/** A channel the person only reads, as the list of agents and rooms shows it. */
export interface ReadOnlyEntry {
  channel: Channel;
  /** Whether anyone is working in a thread of it. */
  working: boolean;
}

/**
 * The channels the person only reads, the DMs first and then the rooms, each in
 * alphabetical order of its name, which in a DM is the names of its two members.
 */
export function readOnlyEntries(model: Pick<Model, "readOnly">): ReadOnlyEntry[] {
  const rank = ({ channel }: ReadOnlyEntry): number => (channel.kind === "dm" ? 0 : 1);
  return Object.values(model.readOnly)
    .map(({ channel, threads }) => ({ channel, working: threads.some((thread) => thread.working.length > 0) }))
    .sort((a, b) => rank(a) - rank(b) || a.channel.name.localeCompare(b.channel.name));
}

/** Work that goes on after the console is left: the agent that is working, and the thread it is working in. */
export interface Farewell {
  agent: string;
  thread: string;
}

export type SendResult = { ok: true } | { ok: false };
