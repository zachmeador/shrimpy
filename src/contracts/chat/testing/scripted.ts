import { type MutableReplicatedState, replicatedState } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { RoutedServerPresentation } from "@earendil-works/pi-server";
import { newId } from "../../../lib/ids/index.ts";
import { Refusal, refuse } from "../../../lib/refusal/index.ts";
import { offer, type Offer } from "../../../lib/testing/index.ts";
import {
  type Channel,
  type Chat,
  type Member,
  type Message,
  type Thread,
  ThreadService,
  type ThreadView,
  type Working,
} from "../index.ts";

type Method = Exclude<keyof Chat, "attach" | "detach">;

/** Who the scripted chat asks who people are: the real gateway, in the tests that run one. */
export interface ScriptedIdentity {
  redeem(ticket: string): Promise<Member>;
  member(id: string): Promise<Member | undefined>;
}

export interface ScriptedChatOptions {
  /** The clock, in milliseconds. Messages and marks are stamped with it. */
  now?: () => number;
}

/**
 * A chat server's channels, threads and messages, kept in memory and scripted
 * by a test, for the tests of the console, which watch threads and talk in
 * them. It is a stand-in for what the console needs and nothing more: it takes
 * the calls the console makes, keeps what was posted once however often the
 * same request is sent, and publishes a thread's view as it changes. The person
 * who runs the gateway reads the channels they are not in, a room is made by the
 * test and joined with `addMembers`, and nothing here refuses a write: a test
 * that needs the chat server to refuse runs the chat server itself, as it does
 * for what an agent does with a feed, receipts, edits, deletes and reactions,
 * who a text mentions, and the limits of the chat server, which are not here
 * because nothing that uses this makes those calls.
 */
export interface ScriptedChat {
  /**
   * The `Chat` one connection talks to, and what to run when that connection is
   * over. For offering over a socket. Given the connection's presentation, the
   * connection can attach a thread and watch its live view, which `route` offers.
   */
  serve(presentation: RoutedServerPresentation | undefined, identity: ScriptedIdentity): { chat: Chat; end: () => void };
  /**
   * The live view of a thread, for a server that sends a connection that
   * attaches the thread there: undefined when there is no such thread. The view
   * is published again as messages and working marks change.
   */
  route(threadId: string): Offer | undefined;
  /** The main thread of the DM between two members, made if need be, without going through a connection. */
  dm(a: Member, b: Member): { channel: Channel; thread: Thread };
  /** A room called `name` with these members and its main thread, without going through a connection. */
  room(name: string, members: Member[]): { channel: Channel; thread: Thread };
  /** Say something in a thread as a member, without a connection to do it over. */
  say(author: Member, threadId: string, text: string): Message;
  /** Every message, oldest first, or those of one thread. The copies are the test's to keep. */
  messages(threadId?: string): Message[];
  /** Make the next `times` calls of `method` fail with `error`. */
  fail(method: Method, error: Error, times?: number): void;
}

interface ChannelRecord {
  id: string;
  /** A room's name. A DM has none. */
  name?: string;
  members: Member[];
}

interface ThreadRecord {
  id: string;
  channelId: string;
  main: boolean;
  name: string | null;
  updatedAt: number;
}

const clone = <T>(value: T): T => structuredClone(value);

export function scriptedChat(options: ScriptedChatOptions = {}): ScriptedChat {
  const now = options.now ?? (() => Date.now());
  const channels: ChannelRecord[] = [];
  const threads: ThreadRecord[] = [];
  const log: Message[] = [];
  const posts = new Map<string, Message>();
  const storeId = newId("store");
  const marks = new Map<string, Map<string, number>>();
  const views = new Map<string, MutableReplicatedState<ThreadView>>();
  const failures = new Map<Method, { error: Error; times: number }>();
  let counter = 0;

  const nextId = (prefix: string): string => {
    counter += 1;
    return `${prefix}_${String(counter).padStart(12, "0")}`;
  };
  const isIn = (channel: ChannelRecord, memberId: string): boolean =>
    channel.members.some((member) => member.id === memberId);

  const toThread = (record: ThreadRecord): Thread => {
    const first = log.find((message) => message.threadId === record.id);
    const working: Working[] = [...(marks.get(record.id) ?? [])]
      .map(([memberId, since]) => ({ memberId, since }))
      .sort((a, b) => a.since - b.since);
    return {
      id: record.id,
      channelId: record.channelId,
      main: record.main,
      name: record.name,
      preview: first === undefined ? null : first.text.replace(/\s+/g, " ").trim().slice(0, 80),
      archived: false,
      updatedAt: record.updatedAt,
      working,
    };
  };
  const toView = (record: ThreadRecord): ThreadView =>
    clone({ thread: toThread(record), messages: log.filter((message) => message.threadId === record.id), earlier: 0 });
  /** Publish a thread's view again, if anyone has asked to watch it. */
  const publish = (threadId: string): void => {
    const state = views.get(threadId);
    const record = threads.find((thread) => thread.id === threadId);
    if (state !== undefined && record !== undefined) state.replace(BACKGROUND_CONTEXT, toView(record));
  };
  /** A channel as `viewerId` sees it: a DM is named for the members that are not the viewer, in alphabetical order. */
  const toChannel = (record: ChannelRecord, viewerId?: string): Channel => ({
    id: record.id,
    kind: record.name === undefined ? "dm" : "room",
    name:
      record.name ??
      record.members
        .filter((member) => member.id !== viewerId)
        .map((member) => member.name)
        .sort((a, b) => a.localeCompare(b))
        .join(", "),
    members: clone(record.members),
  });

  const makeDm = (a: Member, b: Member): { channel: ChannelRecord; thread: ThreadRecord } => {
    const existing = channels.find(
      (channel) => channel.name === undefined && isIn(channel, a.id) && isIn(channel, b.id) && channel.members.length === 2,
    );
    if (existing !== undefined) {
      return { channel: existing, thread: threads.find((thread) => thread.channelId === existing.id && thread.main)! };
    }
    const channel: ChannelRecord = { id: nextId("ch"), members: [a, b] };
    const thread: ThreadRecord = { id: nextId("th"), channelId: channel.id, main: true, name: null, updatedAt: now() };
    channels.push(channel);
    threads.push(thread);
    return { channel, thread };
  };

  /** Post as `me`. A retry with the request ID of an earlier post gives back that post. */
  function append(me: Member, threadId: string, text: string, requestId: string): Message {
    const earlier = posts.get(`${me.id} ${requestId}`);
    if (earlier !== undefined) return clone(earlier);
    const thread = threads.find((candidate) => candidate.id === threadId);
    if (thread === undefined) refuse(`Unknown thread: ${threadId}`);
    const message: Message = {
      id: nextId("msg"),
      seq: log.length + 1,
      event: nextId("evt"),
      channelId: thread.channelId,
      threadId: thread.id,
      author: clone(me),
      text,
      sentAt: now(),
      editedAt: null,
      deleted: false,
      mentions: [],
      reactions: [],
      receipts: [],
    };
    log.push(message);
    posts.set(`${me.id} ${requestId}`, message);
    thread.updatedAt = Math.max(thread.updatedAt, message.sentAt);
    publish(thread.id);
    return clone(message);
  }

  function serve(
    presentation: RoutedServerPresentation | undefined,
    identity: ScriptedIdentity,
  ): { chat: Chat; end: () => void } {
    let who: Member | undefined;
    const caller = (): Member => who ?? refuse("Come in with a ticket first.", "service_not_allowed");
    const gate = (method: Method): void => {
      const failure = failures.get(method);
      if (failure === undefined || failure.times === 0) return;
      failure.times -= 1;
      throw failure.error;
    };
    const unsupported = (): never => refuse("The stand-in chat does not do this.");

    const chat: Chat = {
      async enter(ticket) {
        gate("enter");
        who = await identity.redeem(ticket);
        return who;
      },
      async channels() {
        gate("channels");
        const me = caller();
        return channels.filter((channel) => isIn(channel, me.id)).map((channel) => toChannel(channel, me.id));
      },
      async readOnlyChannels() {
        gate("readOnlyChannels");
        const me = caller();
        // A person reads the channels they are not in. An agent reads only its own.
        if (me.kind !== "person") return [];
        return channels.filter((channel) => !isIn(channel, me.id)).map((channel) => toChannel(channel, me.id));
      },
      async openDm(otherId) {
        gate("openDm");
        const me = caller();
        const other = (await identity.member(otherId)) ?? refuse(`There is no member ${otherId} on the roster.`);
        return toChannel(makeDm(me, other).channel, me.id);
      },
      async createRoom() {
        return unsupported();
      },
      async addMembers(channelId, memberIds) {
        gate("addMembers");
        const me = caller();
        const room = channels.find((channel) => channel.id === channelId && channel.name !== undefined);
        if (room === undefined) refuse(`Unknown channel: ${channelId}`);
        for (const id of memberIds) {
          if (isIn(room, id)) continue;
          room.members.push(id === me.id ? me : ((await identity.member(id)) ?? refuse(`There is no member ${id} on the roster.`)));
        }
        return toChannel(room, me.id);
      },
      async threads(channelId) {
        gate("threads");
        return threads
          .filter((thread) => thread.channelId === channelId)
          .map(toThread)
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },
      async createThread(channelId, name) {
        gate("createThread");
        const record: ThreadRecord = { id: nextId("th"), channelId, main: false, name, updatedAt: now() };
        threads.push(record);
        return toThread(record);
      },
      async renameThread() {
        return unsupported();
      },
      async archiveThread() {
        return unsupported();
      },
      async post(threadId, text, requestId) {
        gate("post");
        return append(caller(), threadId, text, requestId);
      },
      async edit() {
        return unsupported();
      },
      async delete() {
        return unsupported();
      },
      async react() {
        return unsupported();
      },
      async unreact() {
        return unsupported();
      },
      async read() {
        return unsupported();
      },
      async leaveReceipt() {
        return unsupported();
      },
      async setWorking(threadId, working) {
        gate("setWorking");
        const me = caller();
        const byMember = marks.get(threadId) ?? new Map<string, number>();
        marks.set(threadId, byMember);
        if (!working) byMember.delete(me.id);
        else if (!byMember.has(me.id)) byMember.set(me.id, now());
        publish(threadId);
      },
      async head() {
        return unsupported();
      },
      async store() {
        gate("store");
        caller();
        return storeId;
      },
      async feed() {
        return unsupported();
      },
      async attach(threadId, context) {
        caller();
        if (!threads.some((thread) => thread.id === threadId)) refuse(`Unknown thread: ${threadId}`);
        if (presentation === undefined) throw new Refusal("This stand-in chat connection does not serve thread views.");
        await presentation.attachSession(threadId, context);
      },
      async detach(context) {
        caller();
        await presentation?.detachSession(context);
      },
    };

    return { chat, end: () => undefined };
  }

  return {
    serve,
    route(threadId) {
      const record = threads.find((thread) => thread.id === threadId);
      if (record === undefined) return undefined;
      let state = views.get(threadId);
      if (state === undefined) {
        state = replicatedState(toView(record));
        views.set(threadId, state);
      }
      return offer(ThreadService, { state });
    },
    dm(a, b) {
      const { channel, thread } = makeDm(a, b);
      return { channel: toChannel(channel, a.id), thread: toThread(thread) };
    },
    room(name, members) {
      const channel: ChannelRecord = { id: nextId("ch"), name, members: clone(members) };
      const thread: ThreadRecord = { id: nextId("th"), channelId: channel.id, main: true, name: null, updatedAt: now() };
      channels.push(channel);
      threads.push(thread);
      return { channel: toChannel(channel), thread: toThread(thread) };
    },
    say(author, threadId, text) {
      return append(author, threadId, text, nextId("said"));
    },
    messages: (threadId) => clone(threadId === undefined ? log : log.filter((message) => message.threadId === threadId)),
    fail(method, error, times = 1) {
      failures.set(method, { error, times });
    },
  };
}
