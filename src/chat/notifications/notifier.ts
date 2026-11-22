import { type ChatEvent, type Member, type Message, receiptWords } from "../../contracts/chat/index.ts";
import type { Notification } from "../../contracts/gateway/index.ts";
import { asError } from "../../lib/errors/index.ts";
import { plain } from "../../lib/plain/index.ts";
import { cutEnd, singleSpaced } from "../../lib/text/index.ts";
import type { LiveIdentity } from "../identity/index.ts";
import type { Store, Transaction } from "../store/index.ts";
import type { Notifier } from "../threads/index.ts";

/** How long something waits unread before you are told of it. */
export const NOTIFY_AFTER_MS = 5_000;

/** The most characters of a line a notification carries. */
const LINE_LENGTH = 120;

export interface NotifierOptions {
  readonly store: Store;
  /** The roster as chat follows it, which says who you are. */
  readonly identity: LiveIdentity;
  /** Hand a finished notification over, to be sent to your devices. */
  handOver(notification: Notification): Promise<void>;
  /** How long something waits unread before you are told of it. */
  readonly afterMs: number;
  /** Told when a notification can't be worked out or handed over, which drops it. */
  onError(error: Error): void;
}

export interface RunningNotifier extends Notifier {
  /** Forget whatever waits. */
  close(): void;
}

/** `text` as a notification carries it: its first line that says anything, on one line, cut short. */
const lineOf = (text: string): string =>
  cutEnd(singleSpaced(plain(text).split("\n").find((line) => line.trim() !== "") ?? ""), LINE_LENGTH, {
    ending: "…",
    unit: "characters",
  });

/**
 * Decide what is worth telling you, and tell it once it has stayed unread for
 * `afterMs`: a message someone else wrote in a DM of yours, a message that
 * names you in a room you are in, and a receipt that says a message of yours
 * failed. A message is read once your read mark in its thread reaches it. A
 * receipt has no place in a thread to mark, so it counts as read once your mark
 * there moves at all. A deleted message is told nothing of. What waits is held
 * in memory alone.
 */
export function createNotifier(options: NotifierOptions): RunningNotifier {
  const { store, identity } = options;
  const waiting = new Set<NodeJS.Timeout>();
  let closed = false;

  /** You, as the roster has you now, or undefined until chat has heard the roster. */
  const you = (): Member | undefined => {
    const entry = identity.now()?.members.find((member) => member.kind === "person");
    return entry === undefined ? undefined : { id: entry.id, kind: entry.kind, name: entry.name };
  };

  /** Once `afterMs` has passed, work out in one transaction what to tell, if anything, and hand it over. */
  const later = (tell: (tx: Transaction) => Notification | undefined): void => {
    if (closed) return;
    const timer = setTimeout(() => {
      waiting.delete(timer);
      let notification: Notification | undefined;
      try {
        notification = store.transaction(tell);
      } catch (error) {
        options.onError(asError(error));
        return;
      }
      if (notification === undefined) return;
      options.handOver(notification).catch((error: unknown) => {
        // A chat server that is stopping drops its link, and with it the answer to what it handed over.
        if (closed) return;
        options.onError(new Error(`A notification for you was dropped: the gateway didn't take it. ${asError(error).message}`));
      });
    }, options.afterMs);
    waiting.add(timer);
  };

  /** The room a thread's channel is, by name, or null for a DM. */
  const roomOf = (tx: Transaction, channelId: string): string | null => {
    const channel = tx.channel(channelId);
    return channel?.kind === "room" ? channel.name : null;
  };

  /** Run `work`, reporting what it throws, since deciding what to tell must never fail what chat has committed. */
  const safely = (work: () => void): void => {
    try {
      work();
    } catch (error) {
      options.onError(asError(error));
    }
  };

  return {
    posted: (message: Message) =>
      safely(() => {
        const person = you();
        if (person === undefined || message.author.id === person.id) return;
        const channel = store.transaction((tx) => tx.channel(message.channelId));
        if (channel === undefined || !channel.members.some((member) => member.id === person.id)) return;
        if (channel.kind === "room" && !message.mentions.includes(person.id)) return;
        later((tx) => {
          const now = tx.message(message.id);
          if (now === undefined || now.deleted || tx.markIn(person.id, message.threadId) >= message.seq) return undefined;
          return {
            from: now.author.name,
            room: roomOf(tx, message.channelId),
            line: lineOf(now.text),
            thread: message.threadId,
            unread: tx.unreadInAll(person.id),
          };
        });
      }),

    failed: (agent: Member, events: readonly ChatEvent[], detail: string) =>
      safely(() => {
        const person = you();
        if (person === undefined) return;
        // One for each thread, however many of your messages there the receipt names.
        const byThread = new Map<string, ChatEvent>();
        for (const event of events) {
          if (event.message.author.id === person.id && !byThread.has(event.message.threadId)) byThread.set(event.message.threadId, event);
        }
        for (const event of byThread.values()) {
          const { threadId, channelId } = event.message;
          const seen = store.transaction((tx) => tx.markIn(person.id, threadId));
          const said = receiptWords({ memberId: agent.id, event: event.id, status: "failed", reply: null, detail }, agent.name) ?? "";
          later((tx) => {
            if (tx.markIn(person.id, threadId) > seen) return undefined;
            return { from: agent.name, room: roomOf(tx, channelId), line: lineOf(said), thread: threadId, unread: tx.unreadInAll(person.id) };
          });
        }
      }),

    close() {
      closed = true;
      for (const timer of waiting) clearTimeout(timer);
      waiting.clear();
    },
  };
}
