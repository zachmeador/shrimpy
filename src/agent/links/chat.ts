import type { Held, Host, Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, type Context } from "@earendil-works/chord/context";
import {
  Channel,
  Chat,
  type ChatEvent,
  type LeftReceipt,
  type Member,
  type Message,
  Thread,
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
 * What the agent does in chat, over the `Chat` it holds and the channels and
 * threads it asks for. Every call that takes a signal ends when it aborts. What
 * chat refuses, a call throws as a `Refusal` with chat's words; anything else
 * thrown is a failure, such as the link dropping while the call was out.
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
  /** Post a message. A request ID's first use wins. */
  post(thread: string, text: string, request: string, signal: AbortSignal): Promise<Message>;
  /** Up to `limit` messages older than the position `before`, or the newest when it is null, oldest first. */
  read(thread: string, before: number | null, limit: number, signal: AbortSignal): Promise<Message[]>;
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
 * The calls over the `Chat` that `host` holds, asking `host` for a channel's or
 * a thread's object as a call needs one. `moved` hears each new head.
 */
function callsOver(host: Host<Principal, Revocation>, chat: Held<typeof Chat>, moved: Listeners<undefined>): ChatCalls {
  /** Run `work` on the object `get` gives, held for as long as it runs. */
  async function on<T, O extends { release(): void }>(
    get: (context: Context) => Promise<O>,
    signal: AbortSignal,
    work: (held: O, context: Context) => Promise<T>,
  ): Promise<T> {
    const context = contextOf(signal);
    const held = await get(context);
    try {
      return await work(held, context);
    } finally {
      held.release();
    }
  }
  const channel = <T>(id: string, signal: AbortSignal, work: (held: Reference<typeof Channel>, context: Context) => Promise<T>) =>
    on((context) => host.get(Channel, { channel: id }, context), signal, work);
  const thread = <T>(id: string, signal: AbortSignal, work: (held: Reference<typeof Thread>, context: Context) => Promise<T>) =>
    on((context) => host.get(Thread, { thread: id }, context), signal, work);

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
      channel(id, signal, async (held) => {
        unlessRefused(held.refusal.value);
        return held.threads.value;
      }),
    createThread: (id, name, signal) =>
      channel(id, signal, async (held, context) => valueOf(await held.createThread({ name }, context))),
    post: (id, text, request, signal) => thread(id, signal, async (held, context) => valueOf(await held.post({ text, request }, context))),
    read: (id, before, limit, signal) =>
      thread(id, signal, async (held, context) => valueOf(await held.read({ before, limit }, context))),
  };
}

/** How long a call that failed for want of its link waits for the loss of chat to be known, before it counts as its own failure. */
const LOSS_FOLLOWS_MS = 5_000;

/**
 * Hold `Chat` through `host`, which has loaded, for as long as the link is
 * open: the hold goes up the agent's link to the gateway, so chat takes it for
 * the agent, and it is what keeps the agent's working marks. Chat is up while
 * the hold is live and chat takes the agent for a member, and is lost whenever
 * the hold stops being live, as when the agent's link or chat's own drops, which
 * also ends the marks: each time chat comes up again is a new `LiveChat`.
 * `through` stands between the agent and chat's calls, which tests use.
 */
export function openChatLink(
  host: Host<Principal, Revocation>,
  onError: (error: Error) => void,
  through: (calls: ChatCalls) => ChatCalls = (calls) => calls,
): ChatLink {
  const context = BACKGROUND_CONTEXT;
  const held = host.hold(Chat, {}, context);
  const moved = createListeners<undefined>(onError);
  const calls = through(callsOver(host, held, moved));
  const arrivals = createListeners<LiveChat>(onError);
  const watches: { stop(): unknown }[] = [];
  let up: { live: LiveChat; lost: AbortController } | undefined;
  let closed = false;

  /** Who chat takes the agent for while the hold is live, or undefined. */
  const member = (): Member | undefined => {
    if (held.state.value.kind !== "live") return undefined;
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
    if (self === undefined) return;
    const lost = new AbortController();
    const live: LiveChat = {
      chat: calls,
      get self() {
        return member() ?? self;
      },
      lost: lost.signal,
    };
    up = { live, lost };
    arrivals.notify(live);
  };

  void held.state.watch(context).then((watch) => {
    if (closed) return void watch.stop();
    watches.push(watch);
    recheck();
    watch.start(async () => recheck());
  });
  void held.you.watch(context).then(
    (watch) => {
      if (closed) return void watch.stop();
      watches.push(watch);
      recheck();
      watch.start(async () => recheck());
    },
    () => undefined,
  );
  void held.head.watch(context).then(
    (watch) => {
      if (closed) return void watch.stop();
      watches.push(watch);
      moved.notify(undefined);
      watch.start(async () => moved.notify(undefined));
    },
    () => undefined,
  );

  const current = (): LiveChat | undefined => (up !== undefined && !up.lost.signal.aborted ? up.live : undefined);

  const untilUp = (signal: AbortSignal): Promise<LiveChat> => {
    const now = current();
    if (now !== undefined) return Promise.resolve(now);
    if (closed) return Promise.reject(new Error("The link to chat is closed."));
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
    async close() {
      closed = true;
      up?.lost.abort(new Error("The link to chat is closed."));
      up = undefined;
      for (const watch of watches.splice(0)) await watch.stop();
      arrivals.clear();
      moved.clear();
      held.release();
    },
  };
}
