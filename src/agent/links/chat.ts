import type { ChatClient, ChatConnection, Member } from "../../contracts/chat/index.ts";
import type { Registration } from "../../contracts/gateway/index.ts";
import type { KeptRegistration } from "../../contracts/gateway/node.ts";
import { isDisconnected, isNotListening } from "../../lib/connection/index.ts";
import { createListeners } from "../../lib/listeners/index.ts";
import { type Backoff, keepRunning } from "../../lib/retry/index.ts";
import { ChatUnavailableError } from "./unavailable.ts";

export interface ChatLinkOptions {
  /**
   * The agent's connection to the gateway, which says where the chat server is
   * and makes the tickets the agent comes in with, as the member it signed in as.
   */
  gateway: Pick<KeptRegistration, "untilUp">;
  /** Connect to the chat server the gateway lists. Called again after each loss. */
  connect(registered: Registration, signal: AbortSignal): Promise<ChatConnection>;
  /** Told of failures worth knowing about. It is not told that chat is not there: that is an ordinary state. */
  onError?: (error: Error) => void;
  /** The pauses between attempts to reach chat. Tests shorten them. */
  backoff?: Backoff;
}

/** A connection that is up, who the agent is on it, and a signal that aborts when it is lost. */
export interface LiveChat {
  readonly chat: ChatClient;
  /** The agent as the roster has it, which is what chat answered when the agent came in. */
  readonly self: Member;
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
  use<T>(use: (live: LiveChat, signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T>;
  /**
   * Call `listener` with the connection that is up now, if any, and with each
   * one that comes up later. Returns what stops that.
   */
  onUp(listener: (live: LiveChat) => void): () => void;
  /** Leave chat and stop trying to reach it. Resolves once the connection is closed. */
  close(): Promise<void>;
}

/**
 * Keep a connection to chat for as long as the link is open: find the chat
 * server through the gateway, take a ticket from it and come in with that, hold
 * the connection, and when it is lost try again, pausing longer after each
 * failure. It never gives up, and it never delays anything that does not need chat.
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
      const { connection, self } = await comeIn(options, signal);
      const lost = new AbortController();
      connection.onDisconnect((reason) => lost.abort(reason ?? new Error("The connection to chat was closed.")));
      try {
        const next: LiveChat = { chat: connection.chat, self, lost: lost.signal };
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
          return await use(current, AbortSignal.any([signal, current.lost]));
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

/**
 * One way in: ask the gateway where chat is and for a ticket for it, connect,
 * and hand chat the ticket. Whoever the agent is comes from chat's answer and
 * from nothing the agent says.
 */
async function comeIn(
  options: ChatLinkOptions,
  signal: AbortSignal,
): Promise<{ connection: ChatConnection; self: Member }> {
  const gateway = await options.gateway.untilUp(signal);
  const registered = (await gateway.list()).findLast((program) => program.kind === "chat");
  if (registered === undefined) throw new ChatUnavailableError("The gateway lists no chat server.");
  const ticket = await gateway.ticket({ kind: registered.kind, name: registered.name });

  let connection: ChatConnection;
  try {
    connection = await options.connect(registered, signal);
  } catch (error) {
    if (!isNotListening(error)) throw error;
    throw new ChatUnavailableError(`The chat server the gateway lists is not answering on ${registered.socket}.`, {
      cause: error,
    });
  }
  try {
    return { connection, self: await connection.chat.enter(ticket, signal) };
  } catch (error) {
    await connection.close().catch(() => undefined);
    throw error;
  }
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
