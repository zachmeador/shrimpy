/**
 * The chat server program: one process that keeps channels, threads, the log of
 * events and the messages they add up to in its own store, and serves the chat
 * contract's objects at `chat()`. It links out to the gateway, which relays
 * every request for chat over that link, stamped with who asks, and it holds
 * the gateway's roster over the same link to know who members are and who is
 * an admin. What stays unread for you for a few seconds, it hands the gateway
 * over the same link, finished, to send to your devices. Other programs reach
 * chat only through `contracts/chat`; they never import this program's
 * modules. It must not know what a member does with an event, anything about
 * an agent's sessions, or how a notification reaches a device.
 */
import { createHost, type HostError } from "@earendil-works/chord";
import { nodeCompression } from "@earendil-works/chord/compression";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  chat,
  contextOf,
  holding,
  type Notification,
  Notifications,
  type Principal,
  type Revocation,
  revokedBy,
  valueOf,
} from "../contracts/gateway/index.ts";
import { gatewaySocket, keepLinked, reportLinking } from "../contracts/gateway/node.ts";
import { opening } from "../lib/closing/index.ts";
import { hostFailure } from "../lib/link/index.ts";
import type { Backoff } from "../lib/retry/index.ts";
import { createIdentity } from "./identity/index.ts";
import { takeChatLock } from "./lock.ts";
import { createNotifier, NOTIFY_AFTER_MS } from "./notifications/index.ts";
import { chatFacet } from "./served/index.ts";
import { openStore } from "./store/index.ts";
import { createWorkingMarks, renameMembers } from "./threads/index.ts";

export { ChatRunningError } from "./lock.ts";

export interface ChatOptions {
  /** Where the chat server keeps its store. */
  dataDir: string;
  /** The pauses between attempts to link to the gateway. Tests shorten them. */
  backoff?: Backoff;
  /** How long something waits unread before you are told of it on your devices: five seconds, unless a test shortens it. */
  notifyAfterMs?: number;
}

/** How long a notification waits for the gateway to take it, which is after every push service has answered. */
const HAND_OVER_MS = 60_000;

export interface RunningChat {
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

/**
 * Take the runtime directory's chat lock, then the data directory, then serve
 * and link out to the gateway's own socket. A runtime directory too long for
 * that socket is refused before anything is made, and the lock comes next, so
 * a second chat server here is refused with `ChatRunningError` before it
 * touches its data directory. The store's own lock still guards a data
 * directory that two servers reach from different runtime directories, and
 * refuses with words of its own.
 *
 * The chat server starts whether or not a gateway is running. It links when it
 * finds one, and again each time the gateway comes back. Without a gateway
 * nobody can reach it, since every request comes through the gateway. It says
 * once that it can't reach the gateway, however long that lasts, and once that
 * it is back, and a refusal once until it changes or the gateway lets it in.
 */
export async function startChat(options: ChatOptions): Promise<RunningChat> {
  const socket = gatewaySocket();
  const lock = takeChatLock();
  const open = opening("The chat server did not close cleanly");
  open.add(() => lock.release());

  try {
    const onError = (error: Error): void => console.error("[chat]", error.message);
    const store = openStore(options.dataDir, { onError });
    open.add(() => store.close());
    const identity = createIdentity(onError);
    const working = createWorkingMarks({ onError });
    const report = (error: HostError): void => console.error(`[chat] ${hostFailure(error).message}`);
    const host = createHost<Principal, Revocation>({
      address: chat(),
      principal: { kind: "chat" },
      revokedBy,
      compression: nodeCompression,
      onError: report,
    });
    open.add(() => host.close(context));
    const handOver = async (notification: Notification): Promise<void> => {
      const within = contextOf(AbortSignal.timeout(HAND_OVER_MS));
      await holding(host.get(Notifications, {}, within), async (held) => valueOf(await held.notify(notification, within)));
    };
    const notifier = createNotifier({ store, identity, handOver, afterMs: options.notifyAfterMs ?? NOTIFY_AFTER_MS, onError });
    open.add(() => notifier.close());
    await host.load([{ name: "@shrimpy/chat", facet: chatFacet({ store, working, identity, notifier, now: () => Date.now() }) }], context);
    identity.follow(host, context);
    open.add(() => identity.close());
    // The store keeps the names the roster has, so channels and messages name members as they are called now.
    open.add(
      identity.subscribe(() => {
        const members = identity.now()?.members;
        if (members !== undefined) renameMembers(store, members);
      }),
    );
    const stopping = new AbortController();
    const place = { path: socket };
    const standing = reportLinking(
      place,
      {
        refused: (error) => `Could not link to the gateway: ${error.message}`,
        meanwhile: "The chat server keeps trying, and nobody can reach chat until it is back.",
      },
      (line) => onError(new Error(line)),
    );
    const linking = keepLinked({
      host,
      place,
      who: () => ({ kind: "chat" }),
      signal: stopping.signal,
      onWelcome: () => standing.welcomed(),
      onError: (error) => standing.failed(error),
      ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
    });
    open.add(async () => {
      stopping.abort();
      await linking;
    });
    return { close: () => open.closeAll() };
  } catch (error) {
    await open.closeAll().catch(() => undefined);
    throw error;
  }
}
