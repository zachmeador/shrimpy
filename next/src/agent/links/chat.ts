import type { ChatClient, ChatConnection, Member } from "../../contracts/chat/index.ts";
import { isDisconnected } from "../../lib/connection/index.ts";
import { createListeners } from "../../lib/listeners/index.ts";
import { type Backoff, keepRunning } from "../../lib/retry/index.ts";
import { ChatUnavailableError } from "./unavailable.ts";

/** Open a connection to the chat server. It fails with `ChatUnavailableError` when chat is not there to be reached. */
export type OpenChat = (signal: AbortSignal) => Promise<ChatConnection>;

export interface ChatLinkOptions {
  /** Who the agent is in chat: what it says on every connection before anything else. */
  self: Member;
  /** How to reach the chat server. Called again after each loss. */
  open: OpenChat;
  /** Told of failures worth knowing about. It is not told that chat is not there: that is an ordinary state. */
  onError?: (error: Error) => void;
  /** The pauses between attempts to reach chat. Tests shorten them. */
  backoff?: Backoff;
}

/** A connection that is up, and a signal that aborts when it is lost. */
export interface LiveChat {
  readonly chat: ChatClient;
  readonly lost: AbortSignal;
}

/** The agent's way to chat, whether or not chat is reachable right now. */
export interface ChatLink {
  /** The connection that is up, if one is. */
  current(): LiveChat | undefined;
  /**
   * Run `use` on a live connection, waiting for one if there is none. If the
   * connection is lost while it runs, `use` is cancelled through its signal and
   * runs again on the next connection, so what it does has to be safe to repeat.
   * A failure `use` has while the connection holds is its own business.
   */
  use<T>(use: (chat: ChatClient, signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T>;
  /**
   * Call `listener` with the connection that is up now, if any, and with each
   * one that comes up later. Returns what stops that.
   */
  onUp(listener: (live: LiveChat) => void): () => void;
  /** Leave chat and stop trying to reach it. Resolves once the connection is closed. */
  close(): Promise<void>;
}

/**
 * Keep a connection to chat for as long as the link is open: connect, say who
 * the agent is, hold the connection, and when it is lost try again, pausing
 * longer after each failure. It never gives up, and it never delays anything
 * that does not need chat.
 */
export function openChatLink(options: ChatLinkOptions): ChatLink {
  const stopping = new AbortController();
  let live: LiveChat | undefined;
  const waiting = new Set<(live: LiveChat) => void>();
  const arrivals = createListeners<LiveChat>((error) => options.onError?.(error));

  const running = keepRunning({
    signal: stopping.signal,
    backoff: options.backoff,
    onError(error) {
      // Chat not being there, or going away, is an ordinary state: the link just tries again.
      if (error instanceof ChatUnavailableError || isDisconnected(error)) return;
      options.onError?.(error instanceof Error ? error : new Error(String(error)));
    },
    async attempt(established, signal) {
      const connection = await options.open(signal);
      const lost = new AbortController();
      connection.onDisconnect((reason) => lost.abort(reason ?? new Error("The connection to chat was closed.")));
      try {
        await connection.chat.identify(options.self, signal);
        const next: LiveChat = { chat: connection.chat, lost: lost.signal };
        live = next;
        established();
        for (const wake of [...waiting]) wake(next);
        arrivals.notify(next);
        await ended(lost.signal, signal);
      } finally {
        live = undefined;
        // Whatever still runs on this connection is cancelled; it runs again on the next one.
        lost.abort(new Error("The connection to chat was closed."));
        await connection.close().catch(() => undefined);
      }
    },
  });

  const up = (signal: AbortSignal): Promise<LiveChat> => {
    if (live !== undefined && !live.lost.aborted) return Promise.resolve(live);
    if (stopping.signal.aborted) return Promise.reject(new Error("The link to chat is closed."));
    return new Promise((resolve, reject) => {
      const arrived = (next: LiveChat): void => {
        cleanup();
        resolve(next);
      };
      const cancel = (): void => {
        cleanup();
        reject(reasonOf(signal));
      };
      function cleanup(): void {
        waiting.delete(arrived);
        signal.removeEventListener("abort", cancel);
      }
      if (signal.aborted) return cancel();
      waiting.add(arrived);
      signal.addEventListener("abort", cancel, { once: true });
    });
  };

  return {
    current: () => (live !== undefined && !live.lost.aborted ? live : undefined),
    async use(use, signal) {
      for (;;) {
        const current = await up(signal);
        try {
          return await use(current.chat, AbortSignal.any([signal, current.lost]));
        } catch (error) {
          // Read through functions: both change while this waits.
          const cancelled = (): boolean => signal.aborted;
          const lost = (): boolean => current.lost.aborted;
          // A call can fail for the lost connection a moment before the loss is known here.
          if (!cancelled() && !lost() && isDisconnected(error)) await ended(current.lost, signal);
          if (cancelled() || !lost()) throw error;
        }
      }
    },
    onUp(listener) {
      const stop = arrivals.add(listener);
      if (live !== undefined && !live.lost.aborted) listener(live);
      return stop;
    },
    async close() {
      stopping.abort();
      arrivals.clear();
      await running;
    },
  };
}

/** Resolves when either signal aborts. */
function ended(...signals: AbortSignal[]): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      for (const signal of signals) signal.removeEventListener("abort", finish);
      resolve();
    };
    for (const signal of signals) signal.addEventListener("abort", finish, { once: true });
    if (signals.some((signal) => signal.aborted)) finish();
  });
}

function reasonOf(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new DOMException("The wait was cancelled", "AbortError");
}
