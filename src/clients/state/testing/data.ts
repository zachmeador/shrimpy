import type { SessionActivity, SessionItem, SessionStatus, SessionSummary } from "../../../contracts/agent/index.ts";
import { sessionStatus } from "../../../contracts/agent/testing/index.ts";
import type { Channel, Member, Message, Receipt, Thread } from "../../../contracts/chat/index.ts";
import type { Program, RosterEntry } from "../../../contracts/gateway/index.ts";
import { PI_PACKAGES, SHRIMPY_VERSION } from "../../../lib/version/index.ts";
import type { ChannelThreads, Model, SessionView, ThreadView } from "../index.ts";

/** The person, as the roster would have them. */
export const zach: Member = { id: "mem_1", kind: "person", name: "zach" };

const agents = new Map<string, Member>();

/** What the gateway runs: what this code runs. */
const GATEWAY = { shrimpy: SHRIMPY_VERSION, pi: PI_PACKAGES };

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

/** A model with nothing wrong and nothing on it: nothing open, every link up, no agents. */
export function aModel(parts: Partial<Model> = {}): Model {
  return {
    me: zach,
    open: { list: undefined, item: undefined },
    gateway: { state: "up" },
    listing: { programs: [], members: [{ ...zach, admin: true, reachable: false }], ways: [], turnedAway: [], versions: GATEWAY },
    chat: { state: "up" },
    agent: undefined,
    dms: {},
    rooms: {},
    readOnly: {},
    thread: undefined,
    behind: {},
    watched: undefined,
    sessions: undefined,
    triggers: undefined,
    defaultModel: undefined,
    looks: {},
    workingSessions: {},
    refusal: undefined,
    watchRefusal: undefined,
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
  return { programs, turnedAway: [], members: [{ ...zach, admin: true, reachable: false }, ...running], ways: [], versions: { ...GATEWAY, shrimpy: version } };
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
    revision: 0,
    updatedAt: 0,
    working: [],
    ...parts,
  };
}

export function aDm(agent: string, threads: Thread[]): ChannelThreads {
  const channel: Channel = { id: "ch_1", kind: "dm", name: agent, members: [zach, agentMember(agent)] };
  return { channel, threads, unread: {} };
}

/** A room the person is in with these agents, and the threads in it. */
export function aRoom(name: string, agents: string[], threads: Thread[], id = "ch_2"): ChannelThreads {
  const channel: Channel = { id, kind: "room", name, members: [zach, ...agents.map(agentMember)] };
  return { channel, threads, unread: {} };
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
    trigger: null,
    receipts: [],
    ...parts,
  };
}

export function aReceipt(agent: string, status: Receipt["status"], detail: string | null = null): Receipt {
  return { memberId: agentMember(agent).id, event: "evt_1", status, reply: null, detail };
}

export function aThreadView(thread: Thread, messages: Message[], earlier = 0, readOnly = false): ThreadView {
  return { thread, messages, earlier, readOnly, unread: 0, firstNew: undefined };
}

/** A session with these items, from its start, a status that is idle unless `parts` says more, and its agent reached unless it says not. */
export function sessionView(
  parts: { items?: SessionItem[]; before?: number | null; status?: Partial<SessionStatus>; reached?: boolean } = {},
): SessionView {
  return { items: parts.items ?? [], before: parts.before ?? null, status: sessionStatus(parts.status), reached: parts.reached ?? true };
}

/** A session that is at work on these items, doing `activity`. */
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

/** A model with a session of an agent's behind no thread open in its list, with the sessions that agent lists and whatever else `parts` adds. */
export function onSession(
  agent: string,
  session: SessionSummary,
  view: SessionView | undefined,
  parts: Partial<Model> = {},
): Model {
  const member = agentMember(agent);
  const list = { kind: "agent" as const, id: member.id };
  return aModel({
    open: { list, item: { kind: "session", agent: member.id, session: session.id } },
    listing: {
      programs: [anAgent(agent), aChatServer()],
      members: [{ ...zach, admin: true, reachable: false }, aRosterAgent(agent)],
      ways: [],
      turnedAway: [],
      versions: GATEWAY,
    },
    agent: { state: "up" },
    sessions: [session],
    watched: view,
    ...parts,
  });
}

/** A model with a thread of an agent's DM open in its list, with whatever else `parts` adds. */
export function onThread(agent: string, thread: Thread, view: ThreadView | undefined, parts: Partial<Model> = {}): Model {
  const member = agentMember(agent);
  const place = { kind: "agent" as const, id: member.id };
  return aModel({
    open: { list: place, item: { kind: "thread", place, thread: thread.id, side: undefined } },
    listing: {
      programs: [anAgent(agent), aChatServer()],
      members: [{ ...zach, admin: true, reachable: false }, aRosterAgent(agent)],
      ways: [],
      turnedAway: [],
      versions: GATEWAY,
    },
    agent: { state: "up" },
    dms: { [member.id]: aDm(agent, [thread]) },
    thread: view,
    ...parts,
  });
}
