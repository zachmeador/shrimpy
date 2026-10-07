import { type ChatClient, type ChatConnection, connectChat, type Member } from "../../contracts/chat/index.ts";
import { type GatewayConnection, reachProgram, type Transports } from "../../contracts/gateway/index.ts";
import type { KeptRegistration } from "../../contracts/gateway/node.ts";
import { disconnected, isDisconnected, isNotListening } from "../../lib/connection/index.ts";
import { createListeners } from "../../lib/listeners/index.ts";
import { type Backoff, keepRunning } from "../../lib/retry/index.ts";
import { ChatUnavailableError } from "./unavailable.ts";

export interface ChatLinkOptions {
  /**
   * The agent's connection to the gateway, which says whether the chat server is
   * registered and makes the tickets the agent comes in with, as the member it
   * signed in as.
   */
  gateway: Pick<KeptRegistration, "untilUp">;
  /** How to reach the chat server through the gateway, by its name. */
  transports: Pick<Transports, "program">;
  /** Open a connection to the chat server over what the gateway offers. `connectChat`, unless a test wraps it. */
  connect?: typeof connectChat;
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
 * failure. The connection goes through the gateway, so it is held only as long
 * as the connection to the gateway that it came in on: a gateway that was lost
 * may have closed the way to chat without a word that reached here, and a
 * connection that waits for a feed on it would wait for good. Once the agent is
 * registered again it comes in again, with a new ticket. It never gives up, and
 * it never delays anything that does not need chat.
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
      const { connection, self, via } = await comeIn(options, signal);
      const closed = new AbortController();
      connection.onDisconnect((reason) => closed.abort(reason ?? new Error("The connection to chat was closed.")));
      // Lost when chat closes the connection, and when the gateway connection it came in on ends.
      const lost = AbortSignal.any([closed.signal, via]);
      try {
        // The gateway may have been lost on the way, which has ended this connection too.
        if (lost.aborted) return;
        const next: LiveChat = { chat: connection.chat, self, lost };
        live = next;
        established();
        for (const wake of [...waiting]) wake(next);
        arrivals.notify(next);
        await ended(lost, signal);
      } finally {
        live = undefined;
        // Whatever still runs on this connection is cancelled; it runs again on the next one.
        closed.abort(new Error("The connection to chat was closed."));
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

/** What aborts when each connection to the gateway ends, made once for each, since one is asked about on every try. */
const endings = new WeakMap<GatewayConnection, AbortSignal>();

function endOf(gateway: GatewayConnection): AbortSignal {
  let ending = endings.get(gateway);
  if (ending === undefined) {
    const ended = new AbortController();
    gateway.onDisconnect(() => ended.abort(disconnected("The connection to the gateway that chat is reached through ended.")));
    ending = ended.signal;
    endings.set(gateway, ending);
  }
  return ending;
}

/**
 * One way in: find the chat server in the gateway's list, then reach it by its
 * name through the gateway and hand it a ticket. Whoever the agent is comes
 * from chat's answer and from nothing the agent says. `via` aborts when the
 * connection to the gateway that this comes in on ends, whenever that is, and
 * giving up on the way in is then no failure: it is the gateway that was lost.
 */
async function comeIn(
  options: ChatLinkOptions,
  signal: AbortSignal,
): Promise<{ connection: ChatConnection; self: Member; via: AbortSignal }> {
  const gateway = await options.gateway.untilUp(signal);
  const via = endOf(gateway);
  const coming = AbortSignal.any([signal, via]);
  const registered = (await gateway.list()).findLast((program) => program.kind === "chat");
  if (registered === undefined) throw new ChatUnavailableError("The gateway lists no chat server.");
  try {
    const { connection, entered } = await reachProgram({
      gateway,
      transports: options.transports,
      target: { kind: registered.kind, name: registered.name },
      connect: options.connect ?? connectChat,
      enter: (opened, ticket, enterSignal) => opened.chat.enter(ticket, enterSignal),
      signal: coming,
    });
    return { connection, self: entered, via };
  } catch (error) {
    if (!isNotListening(error)) throw error;
    throw new ChatUnavailableError("The gateway lists the chat server, but its way in is not there.", { cause: error });
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
