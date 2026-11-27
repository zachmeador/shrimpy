import type {
  DefaultModel,
  HomeEntry,
  HomeFile,
  ModelId,
  OnceTrigger,
  Pigment,
  ProcessOutput,
  ProcessSummary,
  SessionActivity,
  SessionItem,
  SessionPlace,
  SessionStatus,
  SessionSummary,
  TriggerSummary,
  TurnFailure,
  WatchSummary,
} from "../../contracts/agent/index.ts";
import { placeLabel, YOUR_DM } from "../../contracts/agent/index.ts";
import { type AgentCommand, type Channel, type Member, type Message, type Thread, titleOf } from "../../contracts/chat/index.ts";
import {
  compareShrimpy,
  linksWith,
  type Machine,
  type Program,
  type RosterEntry,
  type TurnedAwayProgram,
  type Versions,
  type WayIn,
} from "../../contracts/gateway/index.ts";
import { SHRIMPY_VERSION } from "../../lib/version/index.ts";
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
  /** The ID of the first message that was new to the person when they first looked at the thread since it was opened, if any was. */
  firstNew: string | undefined;
}

/**
 * A session as the agent sees it: its newest items, oldest first, and the entry
 * just before the oldest of them, or null when they start at the session's
 * start; what it is doing; and whether the agent is reached now, since what a
 * session showed before its agent went away says nothing of now. The session on
 * show in place of a conversation is read back from where its window starts to
 * as many items as are shown.
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

/**
 * What is open in a list: a thread. `thread` is undefined for a thread that is
 * not started yet: it comes to be with its first message. `place` is the
 * channel it is in. `side` is the member ID of the agent whose view of the
 * session behind the thread is on show in place of the conversation, or
 * undefined while the conversation is.
 */
export type Item = { kind: "thread"; place: Place; thread: string | undefined; side: string | undefined };

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
 * opened from it has that agent's work beside it.
 */
export function agentOfList(open: Open): string | undefined {
  return open.list?.kind === "agent" ? open.list.id : undefined;
}

/**
 * The session on show whole, which is read back from where its window starts:
 * the one behind the open thread that is on show in place of its conversation.
 * By its agent's member ID and its address at the agent.
 */
export function wholeSession(open: Open): { agent: string; address: string } | undefined {
  const { item } = open;
  if (item?.side !== undefined && item.thread !== undefined) return { agent: item.side, address: item.thread };
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
  if (item?.thread === undefined) return [];
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
  if (item === undefined) return undefined;
  const sides = sidesOf(model);
  const at = item.side === undefined ? -1 : sides.indexOf(item.side);
  return item.side !== undefined && at === -1 ? undefined : sides[at + 1];
}

/** `version` when it is a newer Shrimpy than this client's. */
const newerThanThis = (version: string | undefined): string | undefined =>
  version !== undefined && (compareShrimpy(version, SHRIMPY_VERSION) ?? 0) > 0 ? version : undefined;

/** The gateway's version when it runs a newer Shrimpy than this client, which `/update` puts on the client's machine. */
export const gatewayAhead = (model: Pick<Model, "listing">): string | undefined => newerThanThis(model.listing?.versions?.shrimpy);

/**
 * The gateway's version when it turns this client away for the release it
 * runs, as after a release that changes the Pi packages or the major, and is
 * newer than this client's: no thread opens then, so the terminal offers to put
 * that version on its machine on the screen it shows instead.
 */
export function turnedAwayBehind(model: Pick<Model, "gateway">): string | undefined {
  const { gateway } = model;
  if (gateway.state !== "down" || gateway.why.kind !== "refused" || linksWith(gateway.why.versions)) return undefined;
  return newerThanThis(gateway.why.versions.shrimpy);
}

/** The current name of the agent with member ID `id`, from the roster or its DM, falling back to `id`. */
export function agentNameOf(model: Pick<Model, "listing" | "dms">, id: string): string {
  const onRoster = model.listing?.members.find((member) => member.id === id);
  if (onRoster !== undefined) return onRoster.name;
  const inDm = model.dms[id]?.channel.members.find((member) => member.id === id);
  return inDm?.name ?? id;
}

/**
 * The channel chat says the thread `thread` is in: the person's DM with an
 * agent, by the agent's member ID, a room they are in, or a channel they only
 * read. Undefined while chat lists it in none of them.
 */
export function placeOfThread(model: Pick<Model, "dms" | "rooms" | "readOnly">, thread: string): Place | undefined {
  const has = ({ threads }: ChannelThreads): boolean => threads.some((each) => each.id === thread);
  const dm = Object.entries(model.dms).find(([, each]) => has(each));
  if (dm !== undefined) return { kind: "agent", id: dm[0] };
  const room = Object.values(model.rooms).find(has);
  if (room !== undefined) return { kind: "room", id: room.channel.id };
  const reading = Object.values(model.readOnly).find(has);
  return reading === undefined ? undefined : { kind: "read-only", id: reading.channel.id };
}

/**
 * The channel a thread opened from the list `list` is in. From an agent's list
 * it is whichever channel chat says it is in: the person's DM with the agent, a
 * room they are in, or a channel they only read, such as the agent's DM with
 * another agent. From a room's list, or a channel's, it is that one.
 */
export function placeOf(model: Pick<Model, "dms" | "rooms" | "readOnly">, list: Place, thread: string): Place {
  if (list.kind !== "agent") return list;
  const found = placeOfThread(model, thread);
  return found === undefined || found.kind === "agent" ? list : found;
}

/**
 * The sessions what is open needs held, at one address: for a thread, the
 * session behind it of each agent in its channel and of the agent whose list it
 * was opened from. None for a thread that is not started yet.
 */
export function sessionsOpen(model: Pick<Model, "open" | "rooms" | "readOnly">): { address: string; agents: Set<string> } | undefined {
  const { item } = model.open;
  if (item?.thread === undefined) return undefined;
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

/** How many messages in `thread` are new to the person, with `unread` as its channel counts them. Nothing in an archived thread counts as new. */
export const unreadOf = (unread: Readonly<Record<string, number>>, thread: Thread): number => (thread.archived ? 0 : (unread[thread.id] ?? 0));

/** How many messages are new to the person in `channel`, in all its threads that are not archived. */
export const unreadIn = (channel: ChannelThreads | undefined): number =>
  channel === undefined ? 0 : channel.threads.reduce((sum, thread) => sum + unreadOf(channel.unread, thread), 0);

/** The open thread as far as the client knows it: as it is held, or as its channel lists it. Undefined for one not started, or not known yet. */
export function openThreadOf(model: Model): Thread | undefined {
  const { item } = model.open;
  if (item?.thread === undefined) return undefined;
  if (model.thread?.thread.id === item.thread) return model.thread.thread;
  const { place } = item;
  const channel = place.kind === "agent" ? model.dms[place.id] : place.kind === "room" ? model.rooms[place.id] : model.readOnly[place.id];
  return channel?.threads.find((each) => each.id === item.thread);
}

/**
 * Whether this machine has a home for the agent called `agent`, which is what
 * would start it here, and where it looked. A client is handed this and
 * never looks for a home itself.
 */
export type HomeLookup = (agent: string) => { found: boolean; where: string };

/** What was read of an agent, such as a file of its home: its value, or why it could not be read. */
export type AgentRead<T> = { value: T } | { problem: Problem };

/** What was read of an agent's home, each by its path there: the entries of each folder, and each file. */
export interface HomeRead {
  folders: Record<string, AgentRead<HomeEntry[]>>;
  files: Record<string, AgentRead<HomeFile>>;
}

/** Nothing read of a home yet. */
export const NOTHING_READ: HomeRead = { folders: {}, files: {} };

/** Where the file of the trigger `name` is in its agent's home. */
export const triggerFile = (name: string): string => `triggers/${name}.md`;

/** Key in `Model.processOutputs` for one background command of one agent. */
export const processOutputKey = (agentId: string, procId: string): string => `${agentId}\n${procId}`;

/** Something that happened a moment ago that the person should know, which goes away by itself. */
export type Notice =
  | { kind: "not-sent"; problem: Problem }
  | { kind: "not-opened"; problem: Problem }
  /** The person could not join the room they only read. */
  | { kind: "not-joined"; problem: Problem }
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
  /** A command for agents in a room was written after `written`, which names no member there: nothing was posted. */
  | { kind: "no-member"; written: string }
  /** `/devices` with something after it that is not how a device is taken back. `command` has its slash. */
  | { kind: "devices-usage"; command: string }
  /** A device of the person's was taken back, by its label, or its ID when it has none. */
  | { kind: "taken-back"; device: string }
  /** No device of the person's is called `written`. `devices` are the labels of those there are. */
  | { kind: "no-device"; written: string; devices: string[] }
  /** Several devices of the person's are called `written`, so it names none of them. */
  | { kind: "devices-alike"; written: string }
  | { kind: "not-taken-back"; problem: Problem }
  /** `/rename` with nothing after it: what the thread is named, or null while it has no name and shows how it starts. */
  | { kind: "thread-name"; name: string | null }
  /** `/archive` in a thread that is archived already, or `/unarchive` in one that is not: nothing was changed. */
  | { kind: "archived-already" }
  | { kind: "not-archived" }
  /** Chat did not rename the thread, archive it or bring it back, as `change` says. */
  | { kind: "not-changed"; change: "rename" | "archive" | "unarchive"; problem: Problem }
  /** `/update` when this machine isn't behind the gateway, which runs `gateway`, or before the client knows what the gateway runs. */
  | { kind: "nothing-to-update"; gateway: string | undefined }
  /** `/stop` ended the turn (or found none running) while background commands, watches, or triggers are still going in the thread. */
  | { kind: "stop-still-going"; hadTurn: boolean; processes: number; waitingOn: string[]; triggers: number }
  /** `/kill` when no background command is running in this thread. */
  | { kind: "no-processes" }
  /** `/kill` when several background commands run, or the given ID matched none of them. */
  | { kind: "many-processes"; ids: string[] }
  /** `/drop` when this thread waits on no agent. */
  | { kind: "no-watches" }
  /** `/drop` when several agents are waited on, or the given name matched none of them. */
  | { kind: "many-watches"; agents: string[] }
  /** `/cancel`, `/pause`, or `/resume` when no matching trigger comes to this thread. */
  | { kind: "no-triggers"; action: "cancel" | "pause" | "resume" }
  /** `/cancel`, `/pause`, or `/resume` when several match, or the given target matched none of them. */
  | { kind: "many-triggers"; action: "cancel" | "pause" | "resume"; names: string[] }
  /** An action asked of an agent failed. */
  | { kind: "action-failed"; what: "kill" | "drop" | "cancel" | "pause" | "resume" | "fire" | "stop"; agent: string; problem: Problem }
  /** A file was left out of what waits to be sent: it is too big for a message, or a message has as many files as it carries. */
  | { kind: "not-attached"; name: string; size: number; why: "big" | "many" }
  /** A command was written with files waiting to be sent: nothing was sent. */
  | { kind: "files-with-command" };

/** A live watch in `/status`, with whether the watched agent is currently linked. */
export interface StatusWatch {
  watch: WatchSummary;
  running: boolean;
}

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
   * reached or has no session there.
   */
  session:
    | {
        queued: number;
        model: SessionStatus["model"];
        own: boolean;
        defaultModel: ModelId | undefined;
        usage: SessionStatus["usage"];
        failure: TurnFailure | null;
        onceTriggers: OnceTrigger[];
      }
    | undefined;
  /** Background commands running in this thread, oldest first. */
  processes: ProcessSummary[];
  /** Open watches from this thread, oldest first. */
  watches: StatusWatch[];
  /** Standing triggers targeting this thread, in order of name. */
  standingTriggers: TriggerSummary[];
  /** How many of its other sessions were working. Undefined when it could not be asked. */
  othersWorking: number | undefined;
}

/** The agents of a room, as `/status` found them, and everything still going in the thread. */
export interface RoomStatus {
  kind: "room";
  agents: { name: string; running: boolean; working: boolean }[];
  processes: { agent: string; process: ProcessSummary }[];
  watches: { agent: string; watch: WatchSummary; running: boolean }[];
  onceTriggers: { agent: string; trigger: OnceTrigger }[];
  standingTriggers: { agent: string; trigger: TriggerSummary }[];
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
   * What it last said, if it has: the programs linked to it and those it
   * turned away for the release they run, the members, the person's ways in,
   * devices included, what it runs and the machine it runs on, once it has said.
   */
  listing:
    | {
        programs: Program[];
        turnedAway: TurnedAwayProgram[];
        members: RosterEntry[];
        ways: WayIn[];
        versions: Versions | undefined;
        machine: Machine | undefined;
      }
    | undefined;
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
  /** The sessions of the agent whose list is open, as it lists them now and in its order. Undefined until it has. */
  sessions: SessionSummary[] | undefined;
  /** The triggers of the agent whose list is open, in order of name, as it runs them now. Undefined until it has said. */
  triggers: TriggerSummary[] | undefined;
  /** The model the agent whose list is open follows by default, as it last said. Undefined until it has, or while it refuses the person. */
  defaultModel: DefaultModel | undefined;
  /** What was read of the home of the agent whose list is open, as its page asked. What another agent's list read is gone once this one opens. */
  home: HomeRead;
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
  /** Running background processes for each reached agent, by the agent's member ID. */
  processesByAgent: Record<string, ProcessSummary[]>;
  /** Live watches on other agents for each reached agent, by the agent's member ID. */
  watchesByAgent: Record<string, WatchSummary[]>;
  /** Pending one-shot triggers for each reached agent, by the agent's member ID. */
  onceTriggersByAgent: Record<string, OnceTrigger[]>;
  /** Standing triggers for each reached agent, by the agent's member ID. */
  triggersByAgent: Record<string, TriggerSummary[]>;
  /** Fetched output tails for background processes, keyed by `processOutputKey(agentId, procId)`. */
  processOutputs: Record<string, AgentRead<ProcessOutput>>;
  /**
   * What the agent whose list is open said when it would not list its
   * sessions: its words, which stay until it says yes or another list is open.
   */
  refusal: string | undefined;
  notice: Notice | undefined;
  /** What the person last asked of `/status` in the thread they are in. */
  status: Status | undefined;
  /** What this machine has homes for, when the client was told. It never changes. */
  homes: HomeLookup | undefined;
}

/** Deduplicate items by `id`, preserving first-seen order. */
function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Running background processes of `agentId`, combining roll call and any reached open session behind a thread. */
export function processesOf(model: Pick<Model, "processesByAgent" | "behind">, agentId: string): ProcessSummary[] {
  const fromRoll = model.processesByAgent[agentId] ?? [];
  const behind = model.behind[agentId];
  const fromBehind = behind?.reached === true ? behind.status.processes : [];
  return uniqueById([...fromRoll, ...fromBehind]);
}

/** Open watches held by `agentId`, combining roll call and any reached open session behind a thread. */
export function watchesOf(model: Pick<Model, "watchesByAgent" | "behind">, agentId: string): WatchSummary[] {
  const fromRoll = model.watchesByAgent[agentId] ?? [];
  const behind = model.behind[agentId];
  const fromBehind = behind?.reached === true ? behind.status.watches : [];
  return uniqueById([...fromRoll, ...fromBehind]);
}

/** Pending one-shot triggers of `agentId`, soonest first, combining roll call and any reached open session behind a thread. */
export function onceTriggersOf(model: Pick<Model, "onceTriggersByAgent" | "behind">, agentId: string): OnceTrigger[] {
  const fromRoll = model.onceTriggersByAgent[agentId] ?? [];
  const behind = model.behind[agentId];
  const fromBehind = behind?.reached === true ? behind.status.onceTriggers : [];
  return uniqueById([...fromRoll, ...fromBehind]).sort((a, b) => a.due - b.due);
}

/** Standing triggers of `agentId`, in order of name. */
export function triggersOf(model: Pick<Model, "triggersByAgent" | "triggers" | "open">, agentId: string): TriggerSummary[] {
  const fromRoll = model.triggersByAgent[agentId];
  if (fromRoll !== undefined) return fromRoll;
  if (agentOfList(model.open) === agentId && model.triggers !== undefined) return model.triggers;
  return [];
}

/** All member IDs that currently have data in any per-agent map or open session. */
function knownAgentIds(
  model: Pick<Model, "processesByAgent" | "watchesByAgent" | "onceTriggersByAgent" | "triggersByAgent" | "behind" | "open" | "triggers">,
): string[] {
  const ids = new Set<string>([
    ...Object.keys(model.processesByAgent),
    ...Object.keys(model.watchesByAgent),
    ...Object.keys(model.onceTriggersByAgent),
    ...Object.keys(model.triggersByAgent),
    ...Object.keys(model.behind),
  ]);
  const selected = agentOfList(model.open);
  if (selected !== undefined && model.triggers !== undefined) ids.add(selected);
  return [...ids];
}

/** All running background processes belonging to `threadId`, across agents, oldest first. */
export function processesIn(model: Pick<Model, "processesByAgent" | "behind">, threadId: string): { agent: string; process: ProcessSummary }[] {
  const ids = new Set([...Object.keys(model.processesByAgent), ...Object.keys(model.behind)]);
  return [...ids]
    .flatMap((agent) => processesOf(model, agent).filter((p) => p.threadId === threadId).map((process) => ({ agent, process })))
    .sort((a, b) => a.process.startedAt - b.process.startedAt);
}

/** All open watches started from `threadId`, across agents, oldest first. */
export function watchesIn(model: Pick<Model, "watchesByAgent" | "behind">, threadId: string): { agent: string; watch: WatchSummary }[] {
  const ids = new Set([...Object.keys(model.watchesByAgent), ...Object.keys(model.behind)]);
  return [...ids]
    .flatMap((agent) => watchesOf(model, agent).filter((w) => w.fromThread === threadId).map((watch) => ({ agent, watch })))
    .sort((a, b) => a.watch.startedAt - b.watch.startedAt);
}

/** All open watches waiting on `threadId` (reverse watches), across agents, oldest first. */
export function waitsOnThread(model: Pick<Model, "watchesByAgent" | "behind">, threadId: string): { agent: string; watch: WatchSummary }[] {
  const ids = new Set([...Object.keys(model.watchesByAgent), ...Object.keys(model.behind)]);
  return [...ids]
    .flatMap((agent) => watchesOf(model, agent).filter((w) => w.toThread === threadId).map((watch) => ({ agent, watch })))
    .sort((a, b) => a.watch.startedAt - b.watch.startedAt);
}

/** All pending one-shot triggers targeting `threadId`, across agents, soonest first. */
export function onceTriggersIn(model: Pick<Model, "onceTriggersByAgent" | "behind">, threadId: string): { agent: string; trigger: OnceTrigger }[] {
  const ids = new Set([...Object.keys(model.onceTriggersByAgent), ...Object.keys(model.behind)]);
  return [...ids]
    .flatMap((agent) => onceTriggersOf(model, agent).filter((t) => t.threadId === threadId).map((trigger) => ({ agent, trigger })))
    .sort((a, b) => a.trigger.due - b.trigger.due);
}

/** All standing triggers targeting `threadId`, across agents. */
export function standingTriggersIn(
  model: Pick<Model, "triggersByAgent" | "triggers" | "open" | "processesByAgent" | "watchesByAgent" | "onceTriggersByAgent" | "behind">,
  threadId: string,
): { agent: string; trigger: TriggerSummary }[] {
  return knownAgentIds(model)
    .flatMap((agent) => triggersOf(model, agent).filter((t) => t.thread === threadId).map((trigger) => ({ agent, trigger })))
    .sort((a, b) => a.trigger.name.localeCompare(b.trigger.name));
}

/** Which thread-control client commands have something to act on in a thread. */
export interface StillFlags {
  kill: boolean;
  drop: boolean;
  cancel: boolean;
  pause: boolean;
  resume: boolean;
}

/** Which thread-control commands are relevant in the open thread (or all false if none is open). */
export function stillFlagsIn(model: Model, threadId: string | undefined): StillFlags {
  if (threadId === undefined) return { kill: false, drop: false, cancel: false, pause: false, resume: false };
  const standing = standingTriggersIn(model, threadId);
  return {
    kill: processesIn(model, threadId).length > 0,
    drop: watchesIn(model, threadId).length > 0,
    cancel: onceTriggersIn(model, threadId).length > 0,
    pause: standing.some((each) => each.trigger.on),
    resume: standing.some((each) => !each.trigger.on),
  };
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
  /** What it ran when the gateway turned it away for its release, while it is not running and the gateway lists it so. */
  away: TurnedAwayProgram | undefined;
  /** Whether it is working in any session (an active turn or a running background command). */
  working: boolean;
  /** How many sessions it is working in (turns or background commands). */
  sessions: number;
  /** The sessions it is working in that are none of the person's threads with it. */
  elsewhere: SessionSummary[];
  /** Deduplicated names of agents this agent is currently waiting on through open watches. */
  waiting: string[];
  /** How many messages are new to the person in their DM with it. */
  unread: number;
}

/** Whether the member `agentId` is working in `thread`, going by the marks chat keeps. */
export function workingIn(thread: Thread, agentId: string): boolean {
  return thread.working.some((mark) => mark.memberId === agentId);
}

/** Find a thread and its channel anywhere in chat's known channels. */
export function findChannelThread(
  model: Pick<Model, "dms" | "rooms" | "readOnly">,
  threadId: string,
): { channel: Channel; thread: Thread } | undefined {
  for (const group of [model.dms, model.rooms, model.readOnly]) {
    for (const each of Object.values(group)) {
      const thread = each.threads.find((candidate) => candidate.id === threadId);
      if (thread !== undefined) return { channel: each.channel, thread };
    }
  }
  return undefined;
}

/** How a thread is labelled from `viewer`'s perspective: `your DM · title`, `#ops · title`, or `DM with maya · title`. */
export function threadReferenceLabel(
  model: Pick<Model, "dms" | "rooms" | "readOnly" | "sessions" | "me">,
  viewer: string,
  threadId: string,
): string {
  const found = findChannelThread(model, threadId);
  if (found !== undefined) {
    const place = placeIn(found.channel, found.thread, viewer);
    const where = isYours(place) ? YOUR_DM : placeLabel(place, model.me?.name);
    return `${where} · ${titleOf(found.thread)}`;
  }
  const session = model.sessions?.find((each) => each.threadId === threadId);
  if (session?.place !== null && session?.place !== undefined) {
    const where = isYours(session.place) ? YOUR_DM : placeLabel(session.place, model.me?.name);
    const title = session.place.thread.name ?? threadId;
    return `${where} · ${title}`;
  }
  return threadId;
}

/** The working sessions/process-threads among `agentId`'s active threads that are not in the person's DM `dm`. */
function workingElsewhere(
  model: Pick<Model, "dms" | "rooms" | "readOnly">,
  agentId: string,
  sessions: SessionSummary[],
  processes: ProcessSummary[],
  dm: ChannelThreads | undefined,
): SessionSummary[] {
  const yours = new Set(dm?.threads.map((thread) => thread.id));
  const byId = new Map<string, SessionSummary>();
  for (const session of sessions) {
    if (session.working && !yours.has(session.threadId)) byId.set(session.threadId, session);
  }
  for (const proc of processes) {
    if (yours.has(proc.threadId) || byId.has(proc.threadId)) continue;
    const found = findChannelThread(model, proc.threadId);
    byId.set(proc.threadId, {
      id: proc.threadId,
      threadId: proc.threadId,
      channelId: found?.channel.id ?? "",
      place: found === undefined ? null : placeIn(found.channel, found.thread, agentId),
      working: true,
    });
  }
  return [...byId.values()];
}

/** Whether the agent with member ID `id` is linked to the gateway now. */
export function agentRuns(model: Pick<Model, "listing">, id: string): boolean {
  return model.listing?.programs.some((program) => program.kind === "agent" && program.member === id) ?? false;
}

/**
 * The agents on the roster, by name, running or not, with whether each is
 * working (an active turn or a running background command), where, and whom it
 * waits on through open watches.
 */
export function agentEntries(
  model: Pick<Model, "listing" | "dms" | "rooms" | "readOnly" | "workingSessions" | "processesByAgent" | "watchesByAgent" | "behind">,
): AgentEntry[] {
  const running = new Map<string, Program>();
  for (const program of model.listing?.programs ?? []) {
    if (program.kind === "agent" && program.member !== null) running.set(program.member, program);
  }
  const away = new Map<string, TurnedAwayProgram>();
  for (const program of model.listing?.turnedAway ?? []) {
    if (program.kind === "agent" && program.member !== null) away.set(program.member, program);
  }
  return (model.listing?.members ?? [])
    .filter((member) => member.kind === "agent")
    .map((member) => {
      const dm = model.dms[member.id];
      const said = model.workingSessions[member.id] ?? [];
      const procs = processesOf(model, member.id);
      const watches = watchesOf(model, member.id);
      const working = new Set([
        ...(dm?.threads ?? []).filter((thread) => workingIn(thread, member.id)).map((thread) => thread.id),
        ...said.map((session) => session.threadId),
        ...procs.map((proc) => proc.threadId),
      ]);
      const waiting = [...new Set(watches.map((w) => w.onAgentName))];
      return {
        id: member.id,
        name: member.name,
        running: running.has(member.id),
        version: running.get(member.id)?.shrimpy,
        away: running.has(member.id) ? undefined : away.get(member.id),
        working: working.size > 0,
        sessions: working.size,
        elsewhere: workingElsewhere(model, member.id, said, procs, dm),
        waiting,
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
  /** Whether anyone is working in a thread of the room (turn or background command). */
  working: boolean;
  /** How many messages are new to the person in it. */
  unread: number;
}

/** The rooms the person is in, by name. */
export function roomEntries(model: Pick<Model, "me" | "rooms" | "processesByAgent" | "behind">): RoomEntry[] {
  return Object.values(model.rooms)
    .map((room) => ({
      id: room.channel.id,
      name: room.channel.name,
      members: room.channel.members.filter((member) => member.id !== model.me?.id),
      working: room.threads.some((thread) => thread.working.length > 0 || processesIn(model, thread.id).length > 0),
      unread: unreadIn(room),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A room the person only reads, as the list of agents and rooms shows it. */
export interface ReadOnlyEntry {
  channel: Channel;
  /** Whether anyone is working in a thread of it (turn or background command). */
  working: boolean;
  /** How many messages are new to the person in it: in a thread they have not looked at, every message others wrote. */
  unread: number;
}

/**
 * The rooms the person only reads, in alphabetical order of their names. A DM
 * between two agents is not here: it is on the list of each of them.
 */
export function readOnlyEntries(model: Pick<Model, "readOnly" | "processesByAgent" | "behind">): ReadOnlyEntry[] {
  return Object.values(model.readOnly)
    .filter(({ channel }) => channel.kind === "room")
    .map((room) => ({
      channel: room.channel,
      working: room.threads.some((thread) => thread.working.length > 0 || processesIn(model, thread.id).length > 0),
      unread: unreadIn(room),
    }))
    .sort((a, b) => a.channel.name.localeCompare(b.channel.name));
}

/**
 * One thread an agent takes part in, as its list has it. Every session sits
 * behind a real thread.
 */
export interface Part {
  /** The thread's ID. */
  id: string;
  /** The thread as chat lists it. Undefined when chat does not, and only the agent has said it is there. */
  thread: Thread | undefined;
  /** Where it is: as chat has it when chat lists the thread, and else as the agent said. Null when neither knows. */
  place: SessionPlace | null;
  /** It is in the person's DM with the agent. */
  yours: boolean;
  /** Whether the agent is working there (active turn or running background command). */
  working: boolean;
  /** Agents waited on from this thread via open watches. */
  waiting: string[];
  /** When something was last said in it, in milliseconds since the epoch. Undefined for what chat does not list. */
  at: number | undefined;
  /** How many messages in it are new to the person. None in what chat does not list. */
  unread: number;
}

/** Where a thread of `channel` is, for the agent `agentId`, as the agent says a session's place. */
function placeIn(channel: Channel, thread: Thread, agentId: string | undefined): SessionPlace {
  const place = { name: thread.name };
  if (channel.kind === "room") return { kind: "room", room: channel.name, thread: place };
  const other = channel.members.find((member) => member.id !== agentId);
  return { kind: "dm", with: { name: other?.name ?? channel.name, kind: other?.kind ?? "person" }, thread: place };
}

/** The DM of the person with an agent, which is theirs: the other member is a person. */
const isYours = (place: SessionPlace | null): boolean => place?.kind === "dm" && place.with.kind === "person";

/**
 * Everything the agent with member ID `agentId` takes part in, newest first:
 * the threads of its DM with the person, the threads of its DMs with other
 * members, and the threads of rooms it has a session in.
 */
export function partsOf(model: Model, agentId: string): Part[] {
  const dm = model.dms[agentId];
  const reached = model.agent?.state === "up";
  const listed = model.sessions ?? [];
  const sessionBehind = new Map<string, SessionSummary>();
  for (const session of listed) sessionBehind.set(session.threadId, session);
  const procThreads = new Set(processesOf(model, agentId).map((proc) => proc.threadId));

  const parts: Part[] = [];
  const have = new Set<string>();
  const addThread = ({ channel, unread }: ChannelThreads, thread: Thread): void => {
    have.add(thread.id);
    const place = placeIn(channel, thread, agentId);
    const waiting = [...new Set(watchesIn(model, thread.id).map((each) => each.watch.onAgentName))];
    parts.push({
      id: thread.id,
      thread,
      place,
      yours: isYours(place),
      working: workingIn(thread, agentId) || (reached && sessionBehind.get(thread.id)?.working === true) || procThreads.has(thread.id),
      waiting,
      at: thread.updatedAt,
      unread: unreadOf(unread, thread),
    });
  };

  const addThreads = (channel: ChannelThreads): void => {
    for (const thread of channel.threads) addThread(channel, thread);
  };

  if (dm !== undefined) addThreads(dm);
  for (const reading of Object.values(model.readOnly)) {
    if (reading.channel.kind === "dm" && reading.channel.members.some((member) => member.id === agentId)) addThreads(reading);
  }
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
    if (have.has(threadId)) continue;
    const found = inRoom(threadId);
    if (found !== undefined) {
      addThread(found.room, found.thread);
      continue;
    }
    const waiting = [...new Set(watchesIn(model, threadId).map((each) => each.watch.onAgentName))];
    parts.push({
      id: threadId,
      thread: undefined,
      place: session.place,
      yours: isYours(session.place),
      working: (reached && session.working) || procThreads.has(threadId),
      waiting,
      at: undefined,
      unread: 0,
    });
  }
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
  if (item?.thread !== undefined) {
    const open = openThreadOf(model);
    const worker = entries.find((entry) => entry.running && open !== undefined && workingIn(open, entry.id));
    if (worker !== undefined) return { agent: worker.name, thread: item.thread };
    const bg = processesIn(model, item.thread)[0];
    if (bg !== undefined) return { agent: agentNameOf(model, bg.agent), thread: item.thread };
  }
  for (const entry of entries) {
    if (!entry.running || !entry.working) continue;
    const dm = model.dms[entry.id];
    const active = dm?.threads.find((thread) => workingIn(thread, entry.id));
    if (active !== undefined) return { agent: entry.name, thread: active.id };
    const firstProc = processesOf(model, entry.id)[0];
    if (firstProc !== undefined) return { agent: entry.name, thread: firstProc.threadId };
    const other = model.workingSessions[entry.id]?.[0];
    if (other !== undefined) return { agent: entry.name, thread: other.threadId };
  }
  return undefined;
}
