/**
 * The chat server program: one process that keeps channels, threads, the log of
 * events and the messages they add up to in its own store, and serves the chat
 * contract's objects at `chat()`. It links out to the gateway, which relays
 * every request for chat over that link, stamped with who asks, and it holds
 * the gateway's roster over the same link to know who members are and who is
 * an admin. Other programs reach chat only through `contracts/chat`; they never
 * import this program's modules. It must not know what a member does with an
 * event, or anything about an agent's sessions.
 */
import { createHost, type HostError } from "@earendil-works/chord";
import { nodeCompression } from "@earendil-works/chord/compression";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { chat, type Principal, type Revocation, revokedBy } from "../contracts/gateway/index.ts";
import { gatewaySocket, HelloRefusedError, keepLinked, UnknownAnswerError } from "../contracts/gateway/node.ts";
import { hostFailure } from "../lib/link/index.ts";
import type { Backoff } from "../lib/retry/index.ts";
import { createIdentity } from "./identity/index.ts";
import { takeChatLock } from "./lock.ts";
import { chatFacet } from "./served/index.ts";
import { openStore } from "./store/index.ts";
import { createWorkingMarks, renameMembers } from "./threads/index.ts";

export { ChatRunningError } from "./lock.ts";

export interface ChatOptions {
  /** Where the chat server keeps its store. */
  dataDir: string;
  /** The pauses between attempts to link to the gateway. Tests shorten them. */
  backoff?: Backoff;
}

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
  const open: (() => void | Promise<void>)[] = [() => lock.release()];
  const closeAll = async (): Promise<void> => {
    const errors: unknown[] = [];
    for (const close of open.splice(0).reverse()) {
      try {
        await close();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "The chat server did not close cleanly");
  };

  try {
    const onError = (error: Error): void => console.error("[chat]", error.message);
    const store = openStore(options.dataDir, { onError });
    open.push(() => store.close());
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
    open.push(() => host.close(context));
    await host.load([{ name: "@shrimpy/chat", facet: chatFacet({ store, working, identity, now: () => Date.now() }) }], context);
    identity.follow(host, context);
    open.push(() => identity.close());
    // The store keeps the names the roster has, so channels and messages name members as they are called now.
    open.push(
      identity.subscribe(() => {
        const members = identity.members();
        if (members !== undefined) renameMembers(store, members);
      }),
    );
    const stopping = new AbortController();
    let away = false;
    let reported: string | undefined;
    const linking = keepLinked({
      host,
      place: { path: socket },
      who: () => ({ kind: "chat" }),
      signal: stopping.signal,
      onWelcome() {
        reported = undefined;
        if (away) onError(new Error(`The gateway at ${socket} is back.`));
        away = false;
      },
      onError(error) {
        if (error instanceof HelloRefusedError || error instanceof UnknownAnswerError) {
          const told = error instanceof HelloRefusedError ? `Could not link to the gateway: ${error.message}` : error.message;
          if (told === reported) return;
          reported = told;
          onError(new Error(told));
          return;
        }
        if (away) return;
        away = true;
        onError(new Error(`Can't reach the gateway at ${socket}. The chat server keeps trying, and nobody can reach chat until it is back.`));
      },
      ...(options.backoff === undefined ? {} : { backoff: options.backoff }),
    });
    open.push(async () => {
      stopping.abort();
      await linking;
    });
    return { close: closeAll };
  } catch (error) {
    await closeAll().catch(() => undefined);
    throw error;
  }
}
