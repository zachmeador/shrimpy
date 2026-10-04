import type { Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import { DisconnectedError } from "@earendil-works/pi-client";
import { Refusal, refuse } from "../../../lib/refusal/index.ts";
import {
  type Channel,
  type Chat,
  type ChatClient,
  type ChatConnection,
  MAX_MESSAGE_LENGTH,
  MAX_RECEIPT_DETAIL_LENGTH,
  type Member,
  type Message,
  type Receipt,
  type Thread,
  type Working,
} from "../index.ts";

/** The most messages one `read`, `feed` or `leaveReceipt` takes, as the chat server holds it. */
const PAGE = 200;

type Method = Exclude<keyof Chat, "attach" | "detach">;

export interface ScriptedChatOptions {
  /** The clock, in milliseconds. Messages and marks are stamped with it. */
  now?: () => number;
}

/**
 * A chat server's members, channels, threads, messages, receipts and working
 * marks, kept in memory and scripted by a test. It answers what an agent calls
 * the way the chat server does, with the same refusals for the same mistakes,
 * and it can be told to fail, to hold a call, to go down or to forget everything.
 */
export interface ScriptedChat {
  /** The `Chat` one connection talks to, and what to run when that connection is over. For offering over a socket. */
  serve(): { chat: Chat; end: () => void };
  /** A connection in this process, with no socket. While the chat is down it fails as a connection to nothing does. */
  connect(): Promise<ChatConnection>;
  /** `connect`, then say who you are. */
  join(member: Member): Promise<ChatConnection>;

  /** The main thread of the DM between two members, made if need be, without going through a connection. */
  dm(a: Member, b: Member): { channel: Channel; thread: Thread };
  /** Say something in a thread as a member, without a connection to do it over, so an outage cannot get in the way. */
  say(author: Member, threadId: string, text: string): Message;
  /** Every message, oldest first, or those of one thread. The copies are the test's to keep. */
  messages(threadId?: string): Message[];
  /** Who is working in a thread now. */
  working(threadId: string): Working[];

  /** Cut every connection made by `connect` and refuse new ones. A socket's server is stopped by the test. */
  down(): void;
  up(): void;
  /** Forget every message, thread and channel, as a chat server does when its store is replaced. Positions start again from 1. */
  replace(): void;
  /** Make the next `times` calls of `method` fail with `error`. */
  fail(method: Method, error: Error, times?: number): void;
  /** Make calls of `method` wait, from now until `release` is called. Returns how many arrived meanwhile through `arrived`. */
  hold(method: Method): { release(): void; arrived(): number };
  /** How many times `method` was called, failed and held calls included. */
  calls(method: Method): number;
}

interface ChannelRecord {
  id: string;
  members: Member[];
}

interface ThreadRecord {
  id: string;
  channelId: string;
  main: boolean;
  name: string | null;
  archived: boolean;
  updatedAt: number;
}

interface Mark {
  since: number;
  holders: Set<object>;
}

const clone = <T>(value: T): T => structuredClone(value);

/** Why a call was cancelled: the reason it was given, or a plain cancellation. */
const cancellation = (signal: AbortSignal | undefined): Error => {
  const reason: unknown = signal?.reason;
  return reason instanceof Error ? reason : new DOMException("The call was cancelled", "AbortError");
};

export function scriptedChat(options: ScriptedChatOptions = {}): ScriptedChat {
  const now = options.now ?? (() => Date.now());
  let members = new Map<string, Member>();
  let channels: ChannelRecord[] = [];
  let threads: ThreadRecord[] = [];
  let log: Message[] = [];
  let posts = new Map<string, Message>();
  let marks = new Map<string, Map<string, Mark>>();
  let counter = 0;
  let position = 0;
  let reachable = true;
  const waiting = new Set<() => void>();
  const live = new Set<{ drop(reason: Error): void }>();
  const failures = new Map<Method, { error: Error; times: number }>();
  const holds = new Map<Method, { gate: Promise<void>; release(): void; arrived: number }>();
  const calls = new Map<Method, number>();

  const nextId = (prefix: string): string => {
    counter += 1;
    return `${prefix}_${String(counter).padStart(12, "0")}`;
  };
  const head = (): number => log.at(-1)?.seq ?? 0;
  const channelOf = (id: string): ChannelRecord | undefined => channels.find((channel) => channel.id === id);
  const isIn = (channel: ChannelRecord | undefined, memberId: string): boolean =>
    channel?.members.some((member) => member.id === memberId) ?? false;

  const toThread = (record: ThreadRecord): Thread => {
    const first = log.find((message) => message.threadId === record.id);
    const working: Working[] = [...(marks.get(record.id) ?? [])]
      .map(([memberId, mark]) => ({ memberId, since: mark.since }))
      .sort((a, b) => a.since - b.since);
    return {
      id: record.id,
      channelId: record.channelId,
      main: record.main,
      name: record.name,
      preview: first === undefined ? null : first.text.replace(/\s+/g, " ").trim().slice(0, 80),
      archived: record.archived,
      updatedAt: record.updatedAt,
      working,
    };
  };
  const toChannel = (record: ChannelRecord, viewer: Member): Channel => ({
    id: record.id,
    kind: "dm",
    name: record.members
      .filter((member) => member.id !== viewer.id)
      .map((member) => member.name)
      .join(", "),
    members: clone(record.members),
  });

  const remember = (member: Member): Member => {
    const known = members.get(member.id);
    if (known !== undefined && known.kind !== member.kind) {
      refuse(`${member.id} is on record with kind ${known.kind}, not ${member.kind}.`);
    }
    members.set(member.id, known ?? member);
    return known ?? member;
  };

  const makeDm = (a: Member, b: Member): { channel: ChannelRecord; thread: ThreadRecord } => {
    const first = remember(a);
    const second = remember(b);
    const existing = channels.find(
      (channel) => isIn(channel, first.id) && isIn(channel, second.id) && channel.members.length === 2,
    );
    if (existing !== undefined) {
      return { channel: existing, thread: threads.find((thread) => thread.channelId === existing.id && thread.main)! };
    }
    const channel: ChannelRecord = { id: nextId("ch"), members: [first, second] };
    const thread: ThreadRecord = {
      id: nextId("th"),
      channelId: channel.id,
      main: true,
      name: null,
      archived: false,
      updatedAt: now(),
    };
    channels.push(channel);
    threads.push(thread);
    return { channel, thread };
  };

  /** Resolves when any message is posted. Rejects with the context's reason if it is cancelled first. */
  const nextMessage = (context: Context): Promise<void> => {
    const signal = context.abortSignal;
    return new Promise<void>((resolve, reject) => {
      if (signal?.aborted) {
        reject(cancellation(signal));
        return;
      }
      const wake = (): void => {
        waiting.delete(wake);
        signal?.removeEventListener("abort", cancel);
        resolve();
      };
      function cancel(): void {
        waiting.delete(wake);
        reject(cancellation(signal));
      }
      waiting.add(wake);
      signal?.addEventListener("abort", cancel, { once: true });
    });
  };

  /** A scripted failure, or a held call, comes before whatever the call does. */
  const gate = async (method: Method, context: Context): Promise<void> => {
    calls.set(method, (calls.get(method) ?? 0) + 1);
    const failure = failures.get(method);
    if (failure !== undefined && failure.times > 0) {
      failure.times -= 1;
      throw failure.error;
    }
    const held = holds.get(method);
    if (held === undefined) return;
    held.arrived += 1;
    const signal = context.abortSignal;
    await new Promise<void>((resolve, reject) => {
      if (signal?.aborted) return reject(cancellation(signal));
      signal?.addEventListener("abort", () => reject(cancellation(signal)), { once: true });
      void held.gate.then(resolve);
    });
  };

  /** Post as `me`. A retry with the request ID of an earlier post gives back that post. */
  function append(me: Member, threadId: string, text: string, requestId: string): Message {
    if (typeof text !== "string" || text.trim() === "") refuse("A message needs some text.");
    if (text.length > MAX_MESSAGE_LENGTH) {
      refuse(`A message holds at most ${MAX_MESSAGE_LENGTH} characters, and this one has ${text.length}.`);
    }
    if (typeof requestId !== "string" || requestId === "" || /[\s\p{Cc}]/u.test(requestId)) {
      refuse("requestId must be an ID of 1 to 200 characters with no spaces.");
    }
    const earlier = posts.get(`${me.id} ${requestId}`);
    if (earlier !== undefined) {
      if (earlier.threadId !== threadId || earlier.text !== text) {
        refuse(`Request ${requestId} already posted a different message.`);
      }
      return clone(earlier);
    }
    const thread = threads.find((candidate) => candidate.id === threadId);
    const channel = thread === undefined ? undefined : channelOf(thread.channelId);
    if (thread === undefined || channel === undefined || !isIn(channel, me.id)) refuse(`Unknown thread: ${threadId}`);
    position += 1;
    const message: Message = {
      id: nextId("msg"),
      seq: position,
      channelId: channel.id,
      threadId: thread.id,
      author: clone(me),
      text,
      sentAt: now(),
      addressed: channel.members.filter((member) => member.id !== me.id).map((member) => member.id),
      receipts: [],
    };
    log.push(message);
    posts.set(`${me.id} ${requestId}`, message);
    thread.updatedAt = Math.max(thread.updatedAt, message.sentAt);
    for (const wake of [...waiting]) wake();
    return clone(message);
  }

  function serve(): { chat: Chat; end: () => void } {
    let who: Member | undefined;
    const connection = {};
    const caller = (): Member =>
      who ?? refuse("Say who you are with identify before anything else.", "service_not_allowed");
    const channelFor = (id: string): ChannelRecord => {
      const channel = channelOf(id);
      if (channel === undefined || !isIn(channel, caller().id)) refuse(`Unknown channel: ${id}`);
      return channel;
    };
    const threadFor = (id: string): { thread: ThreadRecord; channel: ChannelRecord } => {
      const thread = threads.find((candidate) => candidate.id === id);
      const channel = thread === undefined ? undefined : channelOf(thread.channelId);
      if (thread === undefined || channel === undefined || !isIn(channel, caller().id)) refuse(`Unknown thread: ${id}`);
      return { thread, channel };
    };
    const whole = (value: unknown, what: string, least: number): number => {
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < least) {
        refuse(`${what} must be a whole number, ${least} or more.`);
      }
      return value;
    };

    const chat: Chat = {
      async identify(claimed, context) {
        await gate("identify", context);
        const member = claimed as Partial<Member> | null;
        if (typeof member?.id !== "string" || typeof member.name !== "string" || (member.kind !== "agent" && member.kind !== "person")) {
          refuse("member must be a member: an id, a kind and a name.");
        }
        if (who !== undefined && who.id !== member.id) refuse(`This connection is already identified as ${who.id}.`);
        who = remember({ id: member.id, kind: member.kind, name: member.name });
      },
      async channels(context) {
        await gate("channels", context);
        const me = caller();
        return channels.filter((channel) => isIn(channel, me.id)).map((channel) => toChannel(channel, me));
      },
      async openDm(other, context) {
        await gate("openDm", context);
        const me = caller();
        if (other.id === me.id) refuse("A DM needs someone besides yourself.");
        return toChannel(makeDm(me, other).channel, me);
      },
      async threads(channelId, context) {
        await gate("threads", context);
        const channel = channelFor(channelId);
        return threads
          .filter((thread) => thread.channelId === channel.id)
          .map(toThread)
          .sort((a, b) => b.updatedAt - a.updatedAt);
      },
      async createThread(channelId, name, context) {
        await gate("createThread", context);
        const channel = channelFor(channelId);
        const record: ThreadRecord = {
          id: nextId("th"),
          channelId: channel.id,
          main: false,
          name,
          archived: false,
          updatedAt: now(),
        };
        threads.push(record);
        return toThread(record);
      },
      async renameThread(threadId, name, context) {
        await gate("renameThread", context);
        const { thread } = threadFor(threadId);
        thread.name = name;
        return toThread(thread);
      },
      async archiveThread(threadId, archived, context) {
        await gate("archiveThread", context);
        const { thread } = threadFor(threadId);
        thread.archived = archived;
        return toThread(thread);
      },
      async post(threadId, text, requestId, context) {
        await gate("post", context);
        return append(caller(), threadId, text, requestId);
      },
      async read(threadId, beforeSeq, limit, context) {
        await gate("read", context);
        const { thread } = threadFor(threadId);
        const before = beforeSeq === null ? null : whole(beforeSeq, "beforeSeq", 0);
        const count = Math.min(whole(limit, "limit", 1), PAGE);
        const older = log.filter((message) => message.threadId === thread.id && (before === null || message.seq < before));
        return clone(older.slice(-count));
      },
      async leaveReceipt(messageIds, given, context) {
        await gate("leaveReceipt", context);
        const me = caller();
        if (me.kind !== "agent") refuse("Only an agent can leave a receipt.");
        if (!Array.isArray(messageIds) || messageIds.length === 0 || messageIds.length > PAGE) {
          refuse(`messageIds must be a list of 1 to ${PAGE} IDs.`);
        }
        const left = checkReceipt(given);
        const reply = left.reply === null ? undefined : log.find((message) => message.id === left.reply);
        const targets = messageIds.map((id) => {
          const message = log.find((candidate) => candidate.id === id);
          if (message === undefined || !isIn(channelOf(message.channelId), me.id)) refuse(`Unknown message: ${id}`);
          if (left.reply !== null && (reply?.author.id !== me.id || reply.threadId !== message.threadId)) {
            refuse(`${left.reply} is not a message you wrote in the same thread as ${id}.`);
          }
          return message;
        });
        for (const message of targets) {
          const receipt: Receipt = { memberId: me.id, ...left };
          message.receipts = [...message.receipts.filter((existing) => existing.memberId !== me.id), receipt].sort(
            (a, b) => (a.memberId < b.memberId ? -1 : 1),
          );
        }
      },
      async setWorking(threadId, working, context) {
        await gate("setWorking", context);
        const me = caller();
        const { thread } = threadFor(threadId);
        const byMember = marks.get(thread.id) ?? new Map<string, Mark>();
        marks.set(thread.id, byMember);
        const mark = byMember.get(me.id);
        if (working) {
          if (mark === undefined) byMember.set(me.id, { since: now(), holders: new Set([connection]) });
          else mark.holders.add(connection);
        } else if (mark?.holders.delete(connection) === true && mark.holders.size === 0) {
          byMember.delete(me.id);
        }
      },
      async head(context) {
        await gate("head", context);
        caller();
        return head();
      },
      async feed(cursor, limit, context) {
        await gate("feed", context);
        const me = caller();
        const after = whole(cursor, "cursor", 0);
        const count = Math.min(whole(limit, "limit", 1), PAGE);
        for (;;) {
          if (after > head()) refuse(`The cursor ${after} is past the newest message, ${head()}. Start again from head.`);
          const found = log.filter((message) => message.seq > after && isIn(channelOf(message.channelId), me.id));
          if (found.length > 0) return clone(found.slice(0, count));
          await nextMessage(context);
        }
      },
      attach() {
        caller();
        return Promise.reject(new Refusal("The scripted chat does not serve thread views."));
      },
      async detach() {
        caller();
      },
    };

    return {
      chat,
      end() {
        for (const [threadId, byMember] of [...marks]) {
          for (const [memberId, mark] of [...byMember]) {
            if (mark.holders.delete(connection) && mark.holders.size === 0) byMember.delete(memberId);
          }
          if (byMember.size === 0) marks.delete(threadId);
        }
      },
    };
  }

  function lost(reason?: Error): DisconnectedError {
    return new DisconnectedError("Client is disconnected", reason);
  }

  const scripted: ScriptedChat = {
    serve,
    async connect() {
      if (!reachable) {
        throw lost(Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }));
      }
      const { chat: service, end } = serve();
      const dropped = new AbortController();
      const listeners: ((reason: Error | undefined) => void)[] = [];
      let over = false;
      const self = { drop: (reason: Error) => finish(reason) };
      function finish(reason: Error | undefined): void {
        if (over) return;
        over = true;
        live.delete(self);
        dropped.abort(lost(reason));
        end();
        for (const listener of listeners) listener(reason);
      }
      live.add(self);

      const call = <T>(signal: AbortSignal | undefined, run: (context: Context) => Promise<T>): Promise<T> => {
        if (over) return Promise.reject(lost());
        const merged = signal === undefined ? dropped.signal : AbortSignal.any([signal, dropped.signal]);
        return run(withAbortSignal(merged, BACKGROUND_CONTEXT));
      };
      const chat: ChatClient = {
        identify: (member, signal) => call(signal, (context) => service.identify(member, context)),
        channels: (signal) => call(signal, (context) => service.channels(context)),
        openDm: (other, signal) => call(signal, (context) => service.openDm(other, context)),
        threads: (channelId, signal) => call(signal, (context) => service.threads(channelId, context)),
        createThread: (channelId, name, signal) =>
          call(signal, (context) => service.createThread(channelId, name, context)),
        renameThread: (threadId, name, signal) =>
          call(signal, (context) => service.renameThread(threadId, name, context)),
        archiveThread: (threadId, archived, signal) =>
          call(signal, (context) => service.archiveThread(threadId, archived, context)),
        post: (threadId, text, requestId, signal) =>
          call(signal, (context) => service.post(threadId, text, requestId, context)),
        read: (threadId, beforeSeq, limit, signal) =>
          call(signal, (context) => service.read(threadId, beforeSeq, limit, context)),
        leaveReceipt: (messageIds, receipt, signal) =>
          call(signal, (context) => service.leaveReceipt(messageIds, receipt, context)),
        setWorking: (threadId, working, signal) =>
          call(signal, (context) => service.setWorking(threadId, working, context)),
        head: (signal) => call(signal, (context) => service.head(context)),
        feed: (cursor, limit, signal) => call(signal, (context) => service.feed(cursor, limit, context)),
      };
      return {
        chat,
        attach: () => Promise.reject(new Error("The scripted chat does not serve thread views.")),
        detach: () => Promise.resolve(),
        onDisconnect: (listener) => void listeners.push(listener),
        close() {
          finish(undefined);
          return Promise.resolve();
        },
      };
    },
    async join(member) {
      const connection = await scripted.connect();
      await connection.chat.identify(member);
      return connection;
    },

    dm(a, b) {
      const { channel, thread } = makeDm(a, b);
      return { channel: toChannel(channel, a), thread: toThread(thread) };
    },
    say(author, threadId, text) {
      return append(remember(author), threadId, text, nextId("said"));
    },
    messages: (threadId) => clone(threadId === undefined ? log : log.filter((message) => message.threadId === threadId)),
    working: (threadId) => toThread(threads.find((thread) => thread.id === threadId)!).working,

    down() {
      reachable = false;
      for (const connection of [...live]) connection.drop(new Error("The scripted chat went down."));
    },
    up() {
      reachable = true;
    },
    replace() {
      members = new Map();
      channels = [];
      threads = [];
      log = [];
      posts = new Map();
      marks = new Map();
      position = 0;
    },
    fail(method, error, times = 1) {
      failures.set(method, { error, times });
    },
    hold(method) {
      let release = (): void => undefined;
      const gateOpen = new Promise<void>((resolve) => {
        release = resolve;
      });
      const held = { gate: gateOpen, release, arrived: 0 };
      holds.set(method, held);
      return {
        release() {
          holds.delete(method);
          held.release();
        },
        arrived: () => held.arrived,
      };
    },
    calls: (method) => calls.get(method) ?? 0,
  };
  return scripted;
}

// The chat server checks a receipt the same way: the reply goes with an answer only, and the reason with a failure only.
function checkReceipt(value: unknown): Omit<Receipt, "memberId"> {
  if (typeof value !== "object" || value === null) refuse("receipt must be a receipt: a status, a reply and a detail.");
  const { status, reply, detail } = value as Record<string, unknown>;
  if (status !== "answered" && status !== "silent" && status !== "stopped" && status !== "skipped" && status !== "failed") {
    refuse('receipt.status must be "answered", "silent", "stopped", "skipped" or "failed".');
  }
  const absent = (field: unknown): boolean => field === undefined || field === null;
  if (status === "answered" && absent(reply)) refuse("An answered receipt needs a reply: the ID of the message that answers it.");
  if (status !== "answered" && !absent(reply)) refuse(`Only an answered receipt has a reply, and this one is ${status}.`);
  if (status !== "failed" && !absent(detail)) refuse(`Only a failed receipt has a detail, and this one is ${status}.`);
  if (status === "failed" && absent(detail)) refuse("A failed receipt needs a detail: a short reason a person can read.");
  if (detail !== undefined && detail !== null) {
    if (typeof detail !== "string" || detail.trim() === "") refuse("receipt.detail must be some text, or null.");
    if (detail.length > MAX_RECEIPT_DETAIL_LENGTH) {
      refuse(`receipt.detail holds at most ${MAX_RECEIPT_DETAIL_LENGTH} characters, and this one has ${detail.length}.`);
    }
  }
  return {
    status,
    reply: typeof reply === "string" ? reply : null,
    detail: typeof detail === "string" ? detail : null,
  };
}
