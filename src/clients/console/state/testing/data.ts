import type {
  Channel,
  Member,
  Message,
  Receipt,
  Thread,
  ThreadView,
} from "../../../../contracts/chat/index.ts";
import type { Registration, RosterEntry } from "../../../../contracts/gateway/index.ts";
import { SHRIMPY_VERSION } from "../../../../lib/version/index.ts";
import type { Dm, Model, Room } from "../index.ts";

/** The person, as the roster would have them. */
export const zach: Member = { id: "mem_1", kind: "person", name: "zach" };

const agents = new Map<string, Member>();

/**
 * An agent as the roster has it. IDs mean nothing, so each agent gets the next
 * one, and asking for the same agent again gives the same member.
 */
export function agentMember(name: string): Member {
  let found = agents.get(name);
  if (found === undefined) {
    found = { id: `mem_${String(agents.size + 2)}`, kind: "agent", name };
    agents.set(name, found);
  }
  return found;
}

/** A model with nothing wrong and nothing on it: the agents screen, every link up, no agents. */
export function aModel(parts: Partial<Model> = {}): Model {
  return {
    me: zach,
    where: { screen: "agents" },
    gateway: { state: "up" },
    listing: { programs: [], members: [{ ...zach, admin: true, reachable: false }], version: SHRIMPY_VERSION },
    chat: { state: "up" },
    agent: undefined,
    dms: {},
    rooms: {},
    thread: undefined,
    session: undefined,
    notice: undefined,
    ...parts,
  };
}

/** An agent as the gateway lists it when it is running. */
export function anAgent(name: string, version = SHRIMPY_VERSION): Registration {
  return {
    kind: "agent",
    name,
    memberId: agentMember(name).id,
    version,
  };
}

/** An agent as the roster lists it, running or not. */
export function aRosterAgent(name: string, reachable = true): RosterEntry {
  return { ...agentMember(name), admin: false, reachable };
}

/**
 * What the gateway lists when `programs` are running: the person, and each agent
 * among them on the roster as reachable. Agents that are not running are
 * added with `idle`.
 */
export function aListing(programs: Registration[], version = SHRIMPY_VERSION, idle: string[] = []) {
  const running = programs.filter((program) => program.kind === "agent").map((program) => aRosterAgent(program.name));
  return { programs, members: [{ ...zach, admin: true, reachable: false }, ...running, ...idle.map((name) => aRosterAgent(name, false))], version };
}

export function aChatServer(version = SHRIMPY_VERSION): Registration {
  return { kind: "chat", name: "chat", memberId: null, version };
}

/** A thread, with the fields a test cares about; the rest are plain. */
export function aThread(id: string, parts: Partial<Thread> = {}): Thread {
  return {
    id,
    channelId: "ch_1",
    main: false,
    name: null,
    preview: null,
    archived: false,
    updatedAt: 0,
    working: [],
    ...parts,
  };
}

export function aDm(agent: string, threads: Thread[]): Dm {
  const channel: Channel = { id: "ch_1", kind: "dm", name: agent, members: [zach, agentMember(agent)] };
  return { channel, threads };
}

/** A room the person is in with these agents, and the threads in it. */
export function aRoom(name: string, agents: string[], threads: Thread[], id = "ch_2"): Room {
  const channel: Channel = { id, kind: "room", name, members: [zach, ...agents.map(agentMember)] };
  return { channel, threads };
}

export function aMessage(id: string, author: Member, text: string, parts: Partial<Message> = {}): Message {
  return {
    id,
    seq: Number(id.replace(/\D/g, "")) || 1,
    event: `evt_${id.replace(/\D/g, "") || "1"}`,
    channelId: "ch_1",
    threadId: "th_1",
    author,
    text,
    sentAt: 0,
    editedAt: null,
    deleted: false,
    mentions: [],
    reactions: [],
    receipts: [],
    ...parts,
  };
}

export function aReceipt(agent: string, status: Receipt["status"], detail: string | null = null): Receipt {
  return { memberId: agentMember(agent).id, event: "evt_1", status, reply: null, detail };
}

export function aThreadView(thread: Thread, messages: Message[], earlier = 0): ThreadView {
  return { thread, messages, earlier };
}

/** A model on a thread of an agent's, with whatever else `parts` adds. */
export function onThread(agent: string, thread: Thread, view: ThreadView | undefined, parts: Partial<Model> = {}): Model {
  return aModel({
    where: { screen: "thread", place: { kind: "agent", name: agent }, thread: thread.id },
    listing: {
      programs: [anAgent(agent), aChatServer()],
      members: [{ ...zach, admin: true, reachable: false }, aRosterAgent(agent)],
      version: SHRIMPY_VERSION,
    },
    agent: { state: "up" },
    dms: { [agent]: aDm(agent, [thread]) },
    thread: view,
    ...parts,
  });
}
