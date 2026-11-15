import type { SessionActivity, SessionItem, SessionStatus, SessionSummary } from "../../../../contracts/agent/index.ts";
import { sessionStatus } from "../../../../contracts/agent/testing/index.ts";
import type { Channel, Member, Message, Receipt, Thread } from "../../../../contracts/chat/index.ts";
import type { Program, RosterEntry } from "../../../../contracts/gateway/index.ts";
import { SHRIMPY_VERSION } from "../../../../lib/version/index.ts";
import type { Dm, Model, Room, SessionView, ThreadView } from "../index.ts";

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
    listing: { programs: [], members: [{ ...zach, admin: true, reachable: false }], ways: [], version: SHRIMPY_VERSION },
    chat: { state: "up" },
    agent: undefined,
    dms: {},
    rooms: {},
    readOnly: {},
    thread: undefined,
    session: undefined,
    sessions: undefined,
    workingSessions: {},
    refusal: undefined,
    notice: undefined,
    status: undefined,
    homes: undefined,
    ...parts,
  };
}

/** An agent as the gateway lists it when it is linked. */
export function anAgent(name: string, version = SHRIMPY_VERSION): Program {
  return { kind: "agent", name, member: agentMember(name).id, shrimpy: version };
}

/** An agent as the roster lists it when it is running. */
function aRosterAgent(name: string): RosterEntry {
  return { ...agentMember(name), admin: false, reachable: true };
}

/** What the gateway lists when `programs` are running: the person, and each agent among them on the roster as reachable. */
export function aListing(programs: Program[], version = SHRIMPY_VERSION): NonNullable<Model["listing"]> {
  const running = programs.filter((program) => program.kind === "agent").map((program) => aRosterAgent(program.name));
  return { programs, members: [{ ...zach, admin: true, reachable: false }, ...running], ways: [], version };
}

export function aChatServer(version = SHRIMPY_VERSION): Program {
  return { kind: "chat", name: "chat", member: null, shrimpy: version };
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

export function aThreadView(thread: Thread, messages: Message[], earlier = 0, readOnly = false): ThreadView {
  return { thread, messages, earlier, readOnly };
}

/** A session on show with these items, from its start, and a status that is idle unless `parts` says more. */
export function sessionView(parts: { items?: SessionItem[]; before?: number | null; status?: Partial<SessionStatus> } = {}): SessionView {
  return { items: parts.items ?? [], before: parts.before ?? null, status: sessionStatus(parts.status) };
}

/** A session on show that is at work on these items, doing `activity`. */
export function workingView(items: SessionItem[], activity: SessionActivity = { kind: "working" }): SessionView {
  return sessionView({ items, status: { activity, busy: true } });
}

/** A session as an agent lists it: behind a thread of that ID with no place yet, and idle, unless `parts` says more. */
export function aSession(id: string, parts: Partial<SessionSummary> = {}): SessionSummary {
  const behindThread = !id.startsWith("trigger:");
  return {
    id,
    threadId: behindThread ? id : null,
    channelId: behindThread ? "ch_1" : null,
    place: null,
    working: false,
    ...parts,
  };
}

/** A model on a session of an agent's being watched, with the sessions that agent lists and whatever else `parts` adds. */
export function onSession(
  agent: string,
  session: SessionSummary,
  view: SessionView | undefined,
  parts: Partial<Model> = {},
): Model {
  return aModel({
    where: { screen: "session", agent, session: session.id },
    listing: {
      programs: [anAgent(agent), aChatServer()],
      members: [{ ...zach, admin: true, reachable: false }, aRosterAgent(agent)],
      ways: [],
      version: SHRIMPY_VERSION,
    },
    agent: { state: "up" },
    sessions: [session],
    session: view,
    ...parts,
  });
}

/** A model on a thread of an agent's, with whatever else `parts` adds. */
export function onThread(agent: string, thread: Thread, view: ThreadView | undefined, parts: Partial<Model> = {}): Model {
  return aModel({
    where: { screen: "thread", place: { kind: "agent", name: agent }, thread: thread.id },
    listing: {
      programs: [anAgent(agent), aChatServer()],
      members: [{ ...zach, admin: true, reachable: false }, aRosterAgent(agent)],
      ways: [],
      version: SHRIMPY_VERSION,
    },
    agent: { state: "up" },
    dms: { [agent]: aDm(agent, [thread]) },
    thread: view,
    ...parts,
  });
}
