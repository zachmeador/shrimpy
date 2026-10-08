import type {
  ModelId,
  SessionActivity,
  SessionStatus,
  SessionSummary,
  SessionView,
} from "../../../contracts/agent/index.ts";
import type { Channel, Member, Thread, ThreadView } from "../../../contracts/chat/index.ts";
import type { Registration, RosterEntry } from "../../../contracts/gateway/index.ts";
import type { LinkStatus, Problem } from "../network/index.ts";

/**
 * Whose threads the person looks at: their DM with an agent, by the agent's
 * name, or a room they are in, by its channel's ID.
 */
export type Place = { kind: "agent"; name: string } | { kind: "room"; id: string };

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
  /** `/model` with a model: the thread uses it from the agent's next request. */
  | { kind: "model-set"; model: ModelId }
  /** `/model default`: the thread follows the agent's model again, which is `defaultModel` when that is known. */
  | { kind: "model-followed"; defaultModel: ModelId | undefined }
  | { kind: "model-not-shown"; problem: Problem }
  | { kind: "model-not-changed"; problem: Problem }
  /** The agent has no session for the open thread yet, so there is no model to show or change. */
  | { kind: "no-session" }
  /** `/model` was written with something that is neither `default` nor a model as provider/id. */
  | { kind: "model-unclear" }
  /** `/model` was written in a room, which has no one agent. */
  | { kind: "model-in-room" };

/** What `/model` was written with in a thread of a DM. */
export type ModelChoice =
  /** Nothing after it: say which model the thread uses. */
  | { kind: "show" }
  /** `default`: follow the agent's model again. */
  | { kind: "default" }
  /** A model as `provider/id`. */
  | { kind: "use"; model: ModelId }
  /** Anything else, which names no model. */
  | { kind: "unclear" };

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
  /** The live view of the open thread. */
  thread: ThreadView | undefined;
  /** The live view of the session on show: the one behind the open thread, once the agent has one, or the one being watched. */
  session: SessionView | undefined;
  /** The sessions of the agent that is selected, as it last listed them and in its order. Undefined until it has. */
  sessions: SessionSummary[] | undefined;
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
  working: boolean;
}

/** Whether the member `agentId` is working in `thread`, going by the marks chat keeps. */
export function workingIn(thread: Thread, agentId: string): boolean {
  return thread.working.some((mark) => mark.memberId === agentId);
}

/**
 * The agents on the roster, by name, running or not, with whether each is
 * working in a thread of the person's.
 */
export function agentEntries(model: Pick<Model, "listing" | "dms">): AgentEntry[] {
  const running = new Map<string, Registration>();
  for (const program of model.listing?.programs ?? []) {
    if (program.kind === "agent" && program.memberId !== null) running.set(program.memberId, program);
  }
  return (model.listing?.members ?? [])
    .filter((member) => member.kind === "agent")
    .map((member) => ({
      id: member.id,
      name: member.name,
      running: running.has(member.id),
      version: running.get(member.id)?.version,
      working: model.dms[member.name]?.threads.some((thread) => workingIn(thread, member.id)) ?? false,
    }))
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

/** Work that goes on after the console is left: the agent that is working, and the thread it is working in. */
export interface Farewell {
  agent: string;
  thread: string;
}

export type SendResult = { ok: true } | { ok: false };
