import type { RefState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  Agent,
  type AgentModel,
  type DefaultModel,
  type HomeEntry,
  type HomeFile,
  type Occurrence,
  type OnceTrigger,
  type Pigment,
  type ProcessOutput,
  type ProcessSummary,
  Session,
  type SessionPage,
  type SessionStatus,
  type SessionSummary,
  type TriggerSummary,
  type WatchSummary,
} from "../../contracts/agent/index.ts";
import { Channel, Chat, type Member, type Message, Thread } from "../../contracts/chat/index.ts";
import {
  type Answer,
  contextOf,
  type Member as RosterMember,
  type Program,
  type Refused,
  Roster,
  type RosterEntry,
  type TurnedAwayProgram,
  type WayIn,
} from "../../contracts/gateway/index.ts";
import { follow } from "./held.ts";
import type { GatewayLink } from "./link.ts";
import { type LinkStatus, statusOf } from "./status.ts";

/** One object a client holds through its link, followed until it is let go. A view of a channel or a thread has no calls. */
export interface Holding<V, Calls = undefined> {
  /** What it shows now, or undefined while it has never had values. */
  shown(): V | undefined;
  /** Where the link to it stands, given whether the gateway lists the program that serves it as linked. */
  status(linked: boolean): LinkStatus;
  /** What can be asked of it. Each call waits while it is loading, and ends when `signal` aborts. */
  readonly calls: Calls;
  /** Let go of it: nothing more is told of it. */
  release(): void;
}

/** Anything held: its state, and members that throw while it has never had values. */
interface Reference {
  readonly state: { readonly value: RefState } & Parameters<typeof follow>[0]["state"];
  release(): void;
}

/**
 * Follow `held`: call `changed` after each change of its state or of `members`,
 * read what it shows with `read`, and keep whether it was ever live, so that a
 * link that drops reads as lost.
 */
function followHeld<R extends Reference, V, Calls>(
  held: R,
  members: (held: R) => Parameters<typeof follow>[1],
  read: (held: R) => V,
  calls: Calls,
  changed: () => void,
): Holding<V, Calls> {
  let wasUp = false;
  let shown: V | undefined;
  const look = (): void => {
    if (held.state.value.kind === "live") wasUp = true;
    try {
      shown = read(held);
    } catch {
      // It has never had values, so what it showed last, if anything, stands.
    }
  };
  const stop = follow(held, members(held), () => {
    look();
    changed();
  });
  look();
  return {
    shown: () => shown,
    status: (linked) => statusOf(held.state.value, linked, wasUp),
    calls,
    release() {
      stop();
      held.release();
    },
  };
}

/** The roster as a client sees it. */
export type RosterShown = { you: RosterMember | null; members: RosterEntry[]; programs: Program[]; turnedAway: TurnedAwayProgram[]; ways: WayIn[] };

export interface RosterCalls {
  /** End a way in at once. */
  takeBack(way: string, signal?: AbortSignal): Promise<Answer<null>>;
}

export function holdRoster(link: GatewayLink, changed: () => void): Holding<RosterShown, RosterCalls> {
  const held = link.host.hold(Roster, {}, BACKGROUND_CONTEXT);
  return followHeld(
    held,
    (roster) => [roster.you, roster.members, roster.programs, roster.turnedAway, roster.ways],
    (roster) => ({
      you: roster.you.value,
      members: roster.members.value,
      programs: roster.programs.value,
      turnedAway: roster.turnedAway.value,
      ways: roster.ways.value,
    }),
    { takeBack: (way, signal) => held.takeBack({ way }, contextOf(signal)) },
    changed,
  );
}

/** A client as a member of chat. */
export type ChatShown = { you: Member | null; channels: Channel[]; readOnlyChannels: Channel[] };

export interface ChatCalls {
  /** The DM with a member, made on first use. */
  openDm(member: string, signal?: AbortSignal): Promise<Answer<Channel>>;
  /** A new thread in a channel, named or not. */
  createThread(channel: string, name: string | null, signal?: AbortSignal): Promise<Answer<Thread>>;
  /** Adds members of the roster to a room, by their member IDs, answering with the room as it now stands. */
  addMembers(channel: string, members: string[], signal?: AbortSignal): Promise<Answer<Channel>>;
  /** Post a message in a thread. A request ID's first use wins. */
  post(thread: string, text: string, request: string, signal?: AbortSignal): Promise<Answer<Message>>;
  /** Move the person's read mark in a message's thread up to that message. A mark only moves forward. */
  markRead(message: string, signal?: AbortSignal): Promise<Answer<null>>;
  /** Name a thread, as decided on its revision `revision`. */
  rename(thread: string, name: string, revision: number, signal?: AbortSignal): Promise<Answer<Thread>>;
  /** Archive a thread or bring it back, as decided on its revision `revision`. */
  archive(thread: string, archived: boolean, revision: number, signal?: AbortSignal): Promise<Answer<Thread>>;
}

export function holdChat(link: GatewayLink, changed: () => void): Holding<ChatShown, ChatCalls> {
  const held = link.host.hold(Chat, {}, BACKGROUND_CONTEXT);
  return followHeld(
    held,
    (chat) => [chat.you, chat.channels, chat.readOnlyChannels],
    (chat) => ({ you: chat.you.value, channels: chat.channels.value, readOnlyChannels: chat.readOnlyChannels.value }),
    {
      openDm: (member, signal) => held.openDm({ member }, contextOf(signal)),
      createThread: (channel, name, signal) => held.createThread({ channel, name }, contextOf(signal)),
      addMembers: (channel, members, signal) => held.addMembers({ channel, members }, contextOf(signal)),
      post: (thread, text, request, signal) => held.post({ thread, text, request }, contextOf(signal)),
      markRead: (message, signal) => held.markRead({ message }, contextOf(signal)),
      rename: (thread, name, revision, signal) => held.rename({ thread, name, revision }, contextOf(signal)),
      archive: (thread, archived, revision, signal) => held.archive({ thread, archived, revision }, contextOf(signal)),
    },
    changed,
  );
}

/** A channel as a client sees it, with how many messages in each of its threads are new to the person, by the thread's ID. */
export type ChannelShown = { refusal: Refused | null; channel: Channel | null; threads: Thread[]; unread: Record<string, number> | null };

export function holdChannel(link: GatewayLink, id: string, changed: () => void): Holding<ChannelShown> {
  const held = link.host.hold(Channel, { channel: id }, BACKGROUND_CONTEXT);
  return followHeld(
    held,
    (channel) => [channel.refusal, channel.channel, channel.threads, channel.unread],
    (channel) => ({ refusal: channel.refusal.value, channel: channel.channel.value, threads: channel.threads.value, unread: channel.unread.value }),
    undefined,
    changed,
  );
}

/** A thread as a client sees it, with how many of its messages are new to the person. */
export type ThreadShown = {
  refusal: Refused | null;
  thread: Thread | null;
  messages: Message[];
  earlier: number;
  readOnly: boolean;
  unread: number | null;
};

export function holdThread(link: GatewayLink, id: string, changed: () => void): Holding<ThreadShown> {
  const held = link.host.hold(Thread, { thread: id }, BACKGROUND_CONTEXT);
  return followHeld(
    held,
    (thread) => [thread.refusal, thread.thread, thread.messages, thread.earlier, thread.readOnly, thread.unread],
    (thread) => ({
      refusal: thread.refusal.value,
      thread: thread.thread.value,
      messages: thread.messages.value,
      earlier: thread.earlier.value,
      readOnly: thread.readOnly.value,
      unread: thread.unread.value,
    }),
    undefined,
    changed,
  );
}

/**
 * An agent as a client sees it: whether it lets the person watch it, its
 * sessions, its triggers and its default model, and how it looks, which every
 * caller sees.
 */
export type AgentShown = {
  refusal: Refused | null;
  sessions: SessionSummary[];
  triggers: TriggerSummary[];
  onceTriggers: OnceTrigger[];
  processes: ProcessSummary[];
  watches: WatchSummary[];
  sigil: string[] | null;
  pigment: Pigment | null;
  model: DefaultModel | null;
};

export interface AgentCalls {
  /** The models the agent can use now. */
  models(signal?: AbortSignal): Promise<Answer<AgentModel[]>>;
  /** The entries of a folder of its home, by the folder's path there, "" for the home itself. */
  folder(path: string, signal?: AbortSignal): Promise<Answer<HomeEntry[]>>;
  /** A file of its home, by its path there, as text or an image. */
  file(path: string, signal?: AbortSignal): Promise<Answer<HomeFile>>;
  /** Fire a standing trigger now, apart from its schedule. */
  fire(name: string, signal?: AbortSignal): Promise<Answer<Occurrence>>;
  /** Turn a standing trigger on or off in its file. */
  switchTrigger(name: string, on: boolean, signal?: AbortSignal): Promise<Answer<TriggerSummary>>;
  /** Recent combined output tail of a background `bash` command. */
  processOutput(id: string, lines?: number, signal?: AbortSignal): Promise<Answer<ProcessOutput>>;
  /** Kill a running background `bash` process group. */
  killProcess(id: string, signal?: AbortSignal): Promise<Answer<null>>;
  /** Cancel a pending one-shot trigger silently. */
  cancelTrigger(id: string, signal?: AbortSignal): Promise<Answer<null>>;
  /** Drop an open watch on another agent silently. */
  cancelWatch(id: string, signal?: AbortSignal): Promise<Answer<null>>;
}

export function holdAgent(link: GatewayLink, id: string, changed: () => void): Holding<AgentShown, AgentCalls> {
  const held = link.host.hold(Agent, { agent: id }, BACKGROUND_CONTEXT);
  return followHeld(
    held,
    (agent) => [agent.refusal, agent.sessions, agent.triggers, agent.onceTriggers, agent.processes, agent.watches, agent.sigil, agent.pigment, agent.model],
    (agent) => ({
      refusal: agent.refusal.value,
      sessions: agent.sessions.value,
      triggers: agent.triggers.value,
      onceTriggers: agent.onceTriggers.value,
      processes: agent.processes.value,
      watches: agent.watches.value,
      sigil: agent.sigil.value,
      pigment: agent.pigment.value,
      model: agent.model.value,
    }),
    {
      models: (signal) => held.models(contextOf(signal)),
      folder: (path, signal) => held.folder({ path }, contextOf(signal)),
      file: (path, signal) => held.file({ path }, contextOf(signal)),
      fire: (name, signal) => held.fire({ name }, contextOf(signal)),
      switchTrigger: (name, on, signal) => held.switchTrigger({ name, on }, contextOf(signal)),
      processOutput: (procId, lines, signal) => held.processOutput(lines === undefined ? { id: procId } : { id: procId, lines }, contextOf(signal)),
      killProcess: (procId, signal) => held.killProcess({ id: procId }, contextOf(signal)),
      cancelTrigger: (triggerId, signal) => held.cancelTrigger({ id: triggerId }, contextOf(signal)),
      cancelWatch: (watchId, signal) => held.cancelWatch({ id: watchId }, contextOf(signal)),
    },
    changed,
  );
}

/** A session as a client sees it: its window over the newest of its history, and what it is doing. */
export type SessionShown = { refusal: Refused | null; window: SessionPage; status: SessionStatus | null };

export interface SessionCalls {
  /** The items of up to `limit` entries from the entry `before` back, that entry included, and the entry before them. */
  read(before: number, limit: number, signal?: AbortSignal): Promise<Answer<SessionPage>>;
  /** Stop the running turn and queued unhanded inputs in this session. */
  stop(signal?: AbortSignal): Promise<Answer<null>>;
}

export function holdSession(link: GatewayLink, agentId: string, session: string, changed: () => void): Holding<SessionShown, SessionCalls> {
  const held = link.host.hold(Session, { agent: agentId, session }, BACKGROUND_CONTEXT);
  return followHeld(
    held,
    (watched) => [watched.refusal, watched.window, watched.status],
    (watched) => ({ refusal: watched.refusal.value, window: watched.window.value, status: watched.status.value }),
    {
      read: (before, limit, signal) => held.read({ before, limit }, contextOf(signal)),
      stop: (signal) => held.stop(contextOf(signal)),
    },
    changed,
  );
}
