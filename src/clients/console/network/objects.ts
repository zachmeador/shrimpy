import type { RefState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, type Context, withAbortSignal } from "@earendil-works/chord/context";
import {
  Agent,
  type AgentModels,
  Session,
  type SessionPage,
  type SessionStatus,
  type SessionSummary,
} from "../../../contracts/agent/index.ts";
import { Channel, Chat, type Member, type Message, Thread } from "../../../contracts/chat/index.ts";
import {
  type Answer,
  type Member as RosterMember,
  type Program,
  type Refused,
  Roster,
  type RosterEntry,
  type WayIn,
} from "../../../contracts/gateway/index.ts";
import { follow } from "./held.ts";
import type { GatewayLink } from "./link.ts";
import { type LinkStatus, statusOf } from "./status.ts";

/** One object the console holds through its link, followed until it is let go. */
export interface Holding<V, Calls> {
  /** What it shows now, or undefined while it has never had values. */
  shown(): V | undefined;
  /** Where the link to it stands, given whether the gateway lists the program that serves it as linked. */
  status(linked: boolean): LinkStatus;
  /** What can be asked of it. Each call waits while it is loading, and ends when `signal` aborts. */
  readonly calls: Calls;
  /** Let go of it: nothing more is told of it. */
  release(): void;
}

const contextOf = (signal: AbortSignal | undefined): Context =>
  signal === undefined ? BACKGROUND_CONTEXT : withAbortSignal(signal, BACKGROUND_CONTEXT);

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
function holding<R extends Reference, V, Calls>(
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

/** The roster as the console sees it. */
export type RosterShown = { you: RosterMember | null; members: RosterEntry[]; programs: Program[]; ways: WayIn[] };

export interface RosterCalls {
  /** End a way in at once. */
  takeBack(way: string, signal?: AbortSignal): Promise<Answer<null>>;
}

export function holdRoster(link: GatewayLink, changed: () => void): Holding<RosterShown, RosterCalls> {
  const held = link.host.hold(Roster, {}, BACKGROUND_CONTEXT);
  return holding(
    held,
    (roster) => [roster.you, roster.members, roster.programs, roster.ways],
    (roster) => ({ you: roster.you.value, members: roster.members.value, programs: roster.programs.value, ways: roster.ways.value }),
    { takeBack: (way, signal) => held.takeBack({ way }, contextOf(signal)) },
    changed,
  );
}

/** The console as a member of chat. */
export type ChatShown = { you: Member | null; channels: Channel[]; readOnlyChannels: Channel[] };

export interface ChatCalls {
  /** The DM with a member, made on first use. */
  openDm(member: string, signal?: AbortSignal): Promise<Answer<Channel>>;
}

export function holdChat(link: GatewayLink, changed: () => void): Holding<ChatShown, ChatCalls> {
  const held = link.host.hold(Chat, {}, BACKGROUND_CONTEXT);
  return holding(
    held,
    (chat) => [chat.you, chat.channels, chat.readOnlyChannels],
    (chat) => ({ you: chat.you.value, channels: chat.channels.value, readOnlyChannels: chat.readOnlyChannels.value }),
    { openDm: (member, signal) => held.openDm({ member }, contextOf(signal)) },
    changed,
  );
}

/** A channel as the console sees it. */
export type ChannelShown = { refusal: Refused | null; channel: Channel | null; threads: Thread[] };

export interface ChannelCalls {
  /** A new thread, named or not. */
  createThread(name: string | null, signal?: AbortSignal): Promise<Answer<Thread>>;
}

export function holdChannel(link: GatewayLink, id: string, changed: () => void): Holding<ChannelShown, ChannelCalls> {
  const held = link.host.hold(Channel, { channel: id }, BACKGROUND_CONTEXT);
  return holding(
    held,
    (channel) => [channel.refusal, channel.channel, channel.threads],
    (channel) => ({ refusal: channel.refusal.value, channel: channel.channel.value, threads: channel.threads.value }),
    { createThread: (name, signal) => held.createThread({ name }, contextOf(signal)) },
    changed,
  );
}

/** A thread as the console sees it. */
export type ThreadShown = {
  refusal: Refused | null;
  thread: Thread | null;
  messages: Message[];
  earlier: number;
  readOnly: boolean;
};

export interface ThreadCalls {
  /** Post a message. A request ID's first use wins. */
  post(text: string, request: string, signal?: AbortSignal): Promise<Answer<Message>>;
}

export function holdThread(link: GatewayLink, id: string, changed: () => void): Holding<ThreadShown, ThreadCalls> {
  const held = link.host.hold(Thread, { thread: id }, BACKGROUND_CONTEXT);
  return holding(
    held,
    (thread) => [thread.refusal, thread.thread, thread.messages, thread.earlier, thread.readOnly],
    (thread) => ({
      refusal: thread.refusal.value,
      thread: thread.thread.value,
      messages: thread.messages.value,
      earlier: thread.earlier.value,
      readOnly: thread.readOnly.value,
    }),
    { post: (text, request, signal) => held.post({ text, request }, contextOf(signal)) },
    changed,
  );
}

/** An agent as the console sees it. */
export type AgentShown = { refusal: Refused | null; sessions: SessionSummary[] };

export interface AgentCalls {
  /** The models the agent can use now, and the one its sessions follow. */
  models(signal?: AbortSignal): Promise<Answer<AgentModels>>;
}

export function holdAgent(link: GatewayLink, name: string, changed: () => void): Holding<AgentShown, AgentCalls> {
  const held = link.host.hold(Agent, { agent: name }, BACKGROUND_CONTEXT);
  return holding(
    held,
    (agent) => [agent.refusal, agent.sessions],
    (agent) => ({ refusal: agent.refusal.value, sessions: agent.sessions.value }),
    { models: (signal) => held.models(contextOf(signal)) },
    changed,
  );
}

/** A session as the console sees it: its window over the newest of its history, and what it is doing. */
export type SessionShown = { refusal: Refused | null; window: SessionPage; status: SessionStatus | null };

export interface SessionCalls {
  /** The items of up to `limit` entries from the entry `before` back, that entry included, and the entry before them. */
  read(before: number, limit: number, signal?: AbortSignal): Promise<Answer<SessionPage>>;
}

export function holdSession(link: GatewayLink, agent: string, session: string, changed: () => void): Holding<SessionShown, SessionCalls> {
  const held = link.host.hold(Session, { agent, session }, BACKGROUND_CONTEXT);
  return holding(
    held,
    (watched) => [watched.refusal, watched.window, watched.status],
    (watched) => ({ refusal: watched.refusal.value, window: watched.window.value, status: watched.status.value }),
    { read: (before, limit, signal) => held.read({ before, limit }, contextOf(signal)) },
    changed,
  );
}
