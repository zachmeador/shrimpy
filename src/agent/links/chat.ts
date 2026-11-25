import type { Held, Host, Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import {
  Channel,
  Chat,
  type ChatEvent,
  type LeftReceipt,
  type Member,
  type Message,
  type Thread,
  type TriggerLine,
} from "../../contracts/chat/index.ts";
import {
  contextOf,
  isLost,
  type Principal,
  type Revocation,
  unlessRefused,
  valueOf,
} from "../../contracts/gateway/index.ts";
import { createListeners, type Listeners, untilAborted, untilHeard } from "../../lib/listeners/index.ts";
import { isRefusal } from "../../lib/refusal/index.ts";

/**
 * What the agent does in chat, over the `Chat` it holds, and the channels it
 * asks for to list their threads. Every call that takes a signal ends when it
 * aborts. What chat refuses, a call throws as a `Refusal` with chat's words;
 * anything else thrown is a failure, such as the link dropping while the call
 * was out.
 */
export interface ChatCalls {
  /** The chat store's ID, made with it and never changed. */
  store(): string;
  /** The position of the newest event in the agent's channels, or 0. */
  head(): number;
  /** Resolves once `head` is past the position `after`, at once if it is. Rejects when `signal` aborts first. */
  untilHead(after: number, signal: AbortSignal): Promise<void>;
  /** The agent's channels, oldest first. */
  channels(): readonly Channel[];
  /** Up to `limit` events after the position `after`, oldest first, and maybe none. A position past `head` is refused. */
  events(after: number, limit: number, signal: AbortSignal): Promise<ChatEvent[]>;
  /** Leave the agent's receipt on 1 to 200 events, all or none. */
  leaveReceipt(events: readonly string[], receipt: LeftReceipt, signal: AbortSignal): Promise<void>;
  /** Mark the agent at work in a thread, or not, for as long as its hold on `Chat` lasts. */
  setWorking(thread: string, working: boolean, signal: AbortSignal): Promise<void>;
  /** The DM with a member, made on first use. */
  openDm(member: string, signal: AbortSignal): Promise<Channel>;
  /** A channel's threads, archived ones too, the most recently updated first. */
  threads(channel: string, signal: AbortSignal): Promise<readonly Thread[]>;
  /** A new thread in a channel. */
  createThread(channel: string, name: string | null, signal: AbortSignal): Promise<Thread>;
  /** Post a message, quietly when `quiet` says so, which tells it to nobody's devices. A request ID's first use wins. */
  post(thread: string, text: string, request: string, signal: AbortSignal, quiet?: boolean): Promise<Message>;
  /** Up to `limit` messages older than the position `before`, or the newest when it is null, oldest first. */
  read(thread: string, before: number | null, limit: number, signal: AbortSignal): Promise<Message[]>;
  /** Show in a thread that one of the agent's triggers fired, as a line. A request ID's first use wins. */
  triggerFired(thread: string, line: TriggerLine, request: string, signal: AbortSignal): Promise<Message>;
}

/** Chat as it is up: its calls, who the agent is there, and a signal that aborts when it is lost. */
export interface LiveChat {
  readonly chat: ChatCalls;
  /** The agent as chat takes it, by the roster's name now. */
  readonly self: Member;
  /** Aborts when what this was up on is lost: the agent's link, or chat's own. */
  readonly lost: AbortSignal;
}

/** The agent's way to chat, whether or not chat is reachable right now. */
export interface ChatLink {
  /** Chat as it is up now, if it is. */
  current(): LiveChat | undefined;
  /**
   * Run `use` on chat that is up, waiting for it if it is not. If chat is lost
   * while it runs, `use` is cancelled through its signal and runs again once
   * chat is up again, so what it does has to be safe to repeat. A failure `use`
   * has while chat holds is its own business.
   */
  use<T>(use: (live: LiveChat, signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T>;
  /** Call `listener` with chat as it is up now, if it is, and each time it comes up again. Returns what stops that. */
  onUp(listener: (live: LiveChat) => void): () => void;
  /** Hold `Chat` on `host`, replacing any earlier host if the agent's member ID changed on a new roster. */
  follow(host: Host<Principal, Revocation>): void;
  /** Let go of chat. Resolves once it is let go. */
  close(): Promise<void>;
}

/**
 * Why a call to chat failed: chat was lost before the call finished, or it
 * answered and said no, for a reason. A failure that is not about chat, such as
 * the turn being stopped or a mistake in the code, is thrown again.
 */
export function chatFailure(error: unknown, live: LiveChat, context: Context): { lost: true } | { refused: string } {
  if (context.abortSignal?.aborted === true) throw error;
  if (live.lost.aborted || isLost(error)) return { lost: true };
  if (isRefusal(error)) return { refused: error.message };
  throw error;
}

/** The signal that ends a call to chat: chat being lost, or the turn being stopped. */
export function callSignal(live: LiveChat, context: Context): AbortSignal {
  return context.abortSignal === undefined ? live.lost : AbortSignal.any([live.lost, context.abortSignal]);
}

/**
 * The calls over the `Chat` that `host` holds, asking `host` for a channel's
 * object to list its threads. `moved` hears each new head.
 */
function callsOver(host: Host<Principal, Revocation>, chat: Held<typeof Chat>, moved: Listeners<undefined>): ChatCalls {
  /** Run `work` on the channel `id`, held for as long as it runs. */
  async function onChannel<T>(id: string, signal: AbortSignal, work: (held: Reference<typeof Channel>) => T): Promise<T> {
    const held = await host.get(Channel, { channel: id }, contextOf(signal));
    try {
      return work(held);
    } finally {
      held.release();
    }
  }

  return {
    store: () => chat.store.value,
    head: () => chat.head.value,
    untilHead(after, signal) {
      if (chat.head.value > after) return Promise.resolve();
      return untilHeard(
        (heard) =>
          moved.add(() => {
            if (chat.head.value > after) heard();
          }),
        signal,
      );
    },
    channels: () => chat.channels.value,
    async events(after, limit, signal) {
      return valueOf(await chat.events({ after, limit }, contextOf(signal)));
    },
    async leaveReceipt(events, receipt, signal) {
      valueOf(await chat.leaveReceipt({ events: [...events], receipt }, contextOf(signal)));
    },
    async setWorking(id, working, signal) {
      valueOf(await chat.setWorking({ thread: id, working }, contextOf(signal)));
    },
    async openDm(member, signal) {
      return valueOf(await chat.openDm({ member }, contextOf(signal)));
    },
    threads: (id, signal) =>
      onChannel(id, signal, (held) => {
        unlessRefused(held.refusal.value);
        return held.threads.value;
      }),
    async createThread(channel, name, signal) {
      return valueOf(await chat.createThread({ channel, name }, contextOf(signal)));
    },
    async post(thread, text, request, signal, quiet = false) {
      return valueOf(await chat.post({ thread, text, request, quiet }, contextOf(signal)));
    },
    async read(thread, before, limit, signal) {
      return valueOf(await chat.read({ thread, before, limit }, contextOf(signal)));
    },
    async triggerFired(thread, { name, firedAt, prompt, output }, request, signal) {
      return valueOf(await chat.triggerFired({ thread, trigger: name, firedAt, prompt, output, request }, contextOf(signal)));
    },
  };
}

/** How long a call that failed for want of its link waits for the loss of chat to be known, before it counts as its own failure. */
const LOSS_FOLLOWS_MS = 5_000;

/** Why chat can't be reached once the agent has let go of its link. */
const CLOSED = "The link to chat is closed.";

/**
 * Manage the agent's hold of `Chat`: stays detached until `follow(host)` gives
 * it the agent's network host (once the gateway has welcomed it with its member
 * ID), and can switch to a new host if the roster is replaced. Chat is up while
 * the hold is live and chat takes the agent for a member, and is lost whenever
 * the hold stops being live, as when the agent's link or chat's own drops, which
 * also ends the marks: each time chat comes up again is a new `LiveChat`.
 * `through` stands between the agent and chat's calls, which tests use.
 */
export function openChatLink(
  onError: (error: Error) => void,
  through: (calls: ChatCalls) => ChatCalls = (calls) => calls,
): ChatLink {
  const context = BACKGROUND_CONTEXT;
  const moved = createListeners<undefined>(onError);
  const arrivals = createListeners<LiveChat>(onError);
  const watches: { stop(): unknown }[] = [];
  let currentHost: Host<Principal, Revocation> | undefined;
  let held: Held<typeof Chat> | undefined;
  let calls: ChatCalls | undefined;
  let up: { live: LiveChat; lost: AbortController } | undefined;
  let closed = false;

  /** Who chat takes the agent for while the hold is live, or undefined. */
  const member = (): Member | undefined => {
    if (held === undefined || held.state.value.kind !== "live") return undefined;
    try {
      return held.you.value ?? undefined;
    } catch {
      return undefined;
    }
  };

  const recheck = (): void => {
    if (closed) return;
    const self = member();
    if (up !== undefined && self?.id === up.live.self.id) return;
    if (up !== undefined) {
      up.lost.abort(new Error("Chat was lost."));
      up = undefined;
    }
    if (self === undefined || calls === undefined) return;
    const lost = new AbortController();
    const liveCalls = calls;
    const live: LiveChat = {
      chat: liveCalls,
      get self() {
        return member() ?? self;
      },
      lost: lost.signal,
    };
    up = { live, lost };
    arrivals.notify(live);
  };

  const follow = (host: Host<Principal, Revocation>): void => {
    if (closed || currentHost === host) return;
    currentHost = host;
    if (up !== undefined) {
      up.lost.abort(new Error("Chat was lost."));
      up = undefined;
    }
    for (const watch of watches.splice(0)) void watch.stop();
    held?.release();

    const next = host.hold(Chat, {}, context);
    held = next;
    calls = through(callsOver(host, next, moved));

    void next.state.watch(context).then((watch) => {
      if (closed || held !== next) return void watch.stop();
      watches.push(watch);
      recheck();
      watch.start(async () => {
        if (held === next) recheck();
      });
    });
    void next.you.watch(context).then(
      (watch) => {
        if (closed || held !== next) return void watch.stop();
        watches.push(watch);
        recheck();
        watch.start(async () => {
          if (held === next) recheck();
        });
      },
      () => undefined,
    );
    void next.head.watch(context).then(
      (watch) => {
        if (closed || held !== next) return void watch.stop();
        watches.push(watch);
        moved.notify(undefined);
        watch.start(async () => {
          if (held === next) moved.notify(undefined);
        });
      },
      () => undefined,
    );
  };

  const current = (): LiveChat | undefined => (up !== undefined && !up.lost.signal.aborted ? up.live : undefined);

  const untilUp = (signal: AbortSignal): Promise<LiveChat> => {
    const now = current();
    if (now !== undefined) return Promise.resolve(now);
    if (closed) return Promise.reject(new Error(CLOSED));
    return untilHeard((heard) => arrivals.add(heard), signal);
  };

  return {
    current,
    async use(use, signal) {
      for (;;) {
        const live = await untilUp(signal);
        try {
          return await use(live, AbortSignal.any([signal, live.lost]));
        } catch (error) {
          // Read through functions: both change while this waits.
          const cancelled = (): boolean => signal.aborted;
          const lost = (): boolean => live.lost.aborted;
          // A call can fail for the lost link a moment before the loss is known here. A failure that no loss follows
          // soon is the call's own.
          if (!cancelled() && !lost() && isLost(error)) {
            await untilAborted(AbortSignal.any([live.lost, signal, AbortSignal.timeout(LOSS_FOLLOWS_MS)]));
          }
          if (cancelled() || !lost()) throw error;
        }
      }
    },
    onUp(listener) {
      const stop = arrivals.add(listener);
      const now = current();
      if (now !== undefined) listener(now);
      return stop;
    },
    follow,
    async close() {
      closed = true;
      currentHost = undefined;
      up?.lost.abort(new Error(CLOSED));
      up = undefined;
      for (const watch of watches.splice(0)) await watch.stop();
      arrivals.clear();
      moved.clear();
      held?.release();
      held = undefined;
      calls = undefined;
    },
  };
}
