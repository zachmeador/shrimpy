import type { Context } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import type { ByteTransportFactory } from "@earendil-works/pi-client";
import { openRoutedConnection, received } from "../../lib/connection/index.ts";
import { Chat, ThreadService } from "./services.ts";
import type { ThreadView } from "./view.ts";

type WithSignal<Method> = Method extends (...args: [...infer Args, Context]) => infer Result
  ? (...args: [...Args, signal?: AbortSignal]) => Result
  : never;

/**
 * Everything a member does in chat, as `Chat` describes it, except watching a
 * thread, which `attach` does. Each call takes an optional signal in place of
 * the Chord context, and cancelling it ends a call that is still waiting, such
 * as `feed`. A call the server refuses rejects with an error whose message says
 * why.
 */
export type ChatClient = {
  [Method in Exclude<keyof Chat, "attach" | "detach">]: WithSignal<Chat[Method]>;
};

/**
 * One attached thread: its live view and updates. A handle lasts until its
 * connection detaches, attaches another thread or closes; after that, reading
 * it throws.
 */
export interface ThreadHandle {
  readonly id: string;
  readonly view: ThreadView;
  /** Calls `listener` with the current view, then after every change. */
  subscribe(listener: (view: ThreadView) => void): () => void;
}

export interface ChatConnection {
  /** Come in with a ticket from the gateway, with `enter`, before anything else. */
  readonly chat: ChatClient;
  /** Watch one thread. A connection watches one at a time; attaching again switches. */
  attach(threadId: string): Promise<ThreadHandle>;
  /** Stop watching the attached thread. */
  detach(): Promise<void>;
  /** Called if the connection drops. Nothing reconnects by itself. */
  onDisconnect(listener: (reason: Error | undefined) => void): void;
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

const contextFor = (signal: AbortSignal | undefined): Context =>
  signal === undefined ? context : withAbortSignal(signal, context);

export async function connectChat(options: {
  serverId: string;
  transportFactory: ByteTransportFactory;
  /** Abort to give up while connecting, even on a server that stopped answering. */
  signal?: AbortSignal;
}): Promise<ChatConnection> {
  const connection = await openRoutedConnection({
    ...options,
    service: Chat,
    route: ThreadService,
  });
  const service = connection.service;

  const chat: ChatClient = {
    enter: (ticket, signal) => service.enter(ticket, contextFor(signal)),
    channels: (signal) => service.channels(contextFor(signal)),
    openDm: (otherId, signal) => service.openDm(otherId, contextFor(signal)),
    createRoom: (name, memberIds, signal) => service.createRoom(name, memberIds, contextFor(signal)),
    addMembers: (channelId, memberIds, signal) => service.addMembers(channelId, memberIds, contextFor(signal)),
    threads: (channelId, signal) => service.threads(channelId, contextFor(signal)),
    createThread: (channelId, name, signal) =>
      service.createThread(channelId, name, contextFor(signal)),
    renameThread: (threadId, name, signal) =>
      service.renameThread(threadId, name, contextFor(signal)),
    archiveThread: (threadId, archived, signal) =>
      service.archiveThread(threadId, archived, contextFor(signal)),
    post: (threadId, text, requestId, signal) => service.post(threadId, text, requestId, contextFor(signal)),
    edit: (messageId, text, signal) => service.edit(messageId, text, contextFor(signal)),
    delete: (messageId, signal) => service.delete(messageId, contextFor(signal)),
    react: (messageId, emoji, signal) => service.react(messageId, emoji, contextFor(signal)),
    unreact: (messageId, emoji, signal) => service.unreact(messageId, emoji, contextFor(signal)),
    read: (threadId, beforeSeq, limit, signal) =>
      service.read(threadId, beforeSeq, limit, contextFor(signal)),
    leaveReceipt: (messageIds, receipt, signal) =>
      service.leaveReceipt(messageIds, receipt, contextFor(signal)),
    setWorking: (threadId, working, signal) =>
      service.setWorking(threadId, working, contextFor(signal)),
    head: (signal) => service.head(contextFor(signal)),
    store: (signal) => service.store(contextFor(signal)),
    feed: (cursor, limit, signal) => service.feed(cursor, limit, contextFor(signal)),
  };

  return {
    chat,
    async attach(threadId) {
      const attachment = await connection.attach(threadId);
      const thread = attachment.service;
      const attached = (): void => {
        if (!attachment.isCurrent()) throw new Error(`Thread ${threadId} is no longer attached`);
      };
      return {
        id: threadId,
        get view() {
          attached();
          return received(thread.state, "thread view");
        },
        subscribe(listener) {
          attached();
          return thread.state.subscribe((view) => listener(view));
        },
      };
    },
    detach: () => connection.detach(),
    onDisconnect: (listener) => connection.onDisconnect(listener),
    close: () => connection.close(),
  };
}
