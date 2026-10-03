import {
  type Context,
  createRemoteServiceBinding,
  type RemoteServiceBinding,
} from "@earendil-works/chord";
import { BACKGROUND_CONTEXT, withAbortSignal } from "@earendil-works/chord/context";
import {
  type ByteTransportFactory,
  Client,
  createClientServiceTransport,
  DisconnectedError,
} from "@earendil-works/pi-client";
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
  /** Say who you are with `identify` before anything else. */
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
}): Promise<ChatConnection> {
  const { serverId } = options;
  const client = await Client.connect({ serverId, transportFactory: options.transportFactory });
  const chatScope = createRemoteServiceBinding({
    services: [Chat],
    transport: createClientServiceTransport(client, () => ({ serverId })),
    bound: true,
  });
  // ready() only waits for services already acquired, so acquire first.
  const service = chatScope.use(Chat);
  try {
    await chatScope.ready(context);
  } catch (error) {
    await client.dispose();
    throw error;
  }

  let threadScope: RemoteServiceBinding | undefined;
  const disconnects: ((reason: Error | undefined) => void)[] = [];
  client.onConnectionStateChange(({ state, error }) => {
    if (state !== "disconnected") return;
    for (const listener of disconnects) listener(error);
  });

  const releaseThread = async (): Promise<void> => {
    const scope = threadScope;
    threadScope = undefined;
    if (scope === undefined) return;
    await scope.dispose(context).catch(() => undefined);
    await service.detach(context).catch(() => undefined);
  };

  const chat: ChatClient = {
    identify: (member, signal) => service.identify(member, contextFor(signal)),
    channels: (signal) => service.channels(contextFor(signal)),
    openDm: (other, signal) => service.openDm(other, contextFor(signal)),
    threads: (channelId, signal) => service.threads(channelId, contextFor(signal)),
    createThread: (channelId, name, signal) =>
      service.createThread(channelId, name, contextFor(signal)),
    renameThread: (threadId, name, signal) =>
      service.renameThread(threadId, name, contextFor(signal)),
    archiveThread: (threadId, archived, signal) =>
      service.archiveThread(threadId, archived, contextFor(signal)),
    post: (threadId, text, requestId, signal) =>
      service.post(threadId, text, requestId, contextFor(signal)),
    read: (threadId, beforeSeq, limit, signal) =>
      service.read(threadId, beforeSeq, limit, contextFor(signal)),
    markSkipped: (messageIds, signal) => service.markSkipped(messageIds, contextFor(signal)),
    setWorking: (threadId, working, signal) =>
      service.setWorking(threadId, working, contextFor(signal)),
    head: (signal) => service.head(contextFor(signal)),
    feed: (cursor, limit, signal) => service.feed(cursor, limit, contextFor(signal)),
  };

  return {
    chat,
    async attach(threadId) {
      await releaseThread();
      const route = expectRoute(client);
      try {
        await service.attach(threadId, context);
        await route.arrived;
        const scope = createRemoteServiceBinding({
          services: [ThreadService],
          transport: createClientServiceTransport(client, () => client.attachment),
          bound: true,
        });
        threadScope = scope;
        const thread = scope.use(ThreadService);
        await scope.ready(context);
        const attached = (): void => {
          if (threadScope !== scope) throw new Error(`Thread ${threadId} is no longer attached`);
        };
        return {
          id: threadId,
          get view() {
            attached();
            return currentView(thread.state.value);
          },
          subscribe(listener) {
            attached();
            return thread.state.subscribe((view) => listener(view));
          },
        };
      } catch (error) {
        route.cancel();
        await releaseThread();
        throw error;
      }
    },
    detach: releaseThread,
    onDisconnect(listener) {
      disconnects.push(listener);
    },
    async close() {
      await releaseThread();
      await chatScope.dispose(context).catch(() => undefined);
      await client.dispose();
    },
  };
}

/**
 * The server announces the attached route out of band, after `attach` resolves
 * or before. Start listening before attaching, and stop if it never comes.
 */
function expectRoute(client: Client): { arrived: Promise<void>; cancel(): void } {
  let stop = (): void => {};
  const arrived = new Promise<void>((resolve, reject) => {
    const stopRoute = client.onAttachmentChange((attachment) => {
      if (attachment === undefined) return;
      stop();
      resolve();
    });
    const stopConnection = client.onConnectionStateChange(({ state, error }) => {
      if (state !== "disconnected") return;
      stop();
      reject(error ?? new DisconnectedError());
    });
    stop = () => {
      stopRoute();
      stopConnection();
    };
  });
  return { arrived, cancel: () => stop() };
}

function currentView(view: ThreadView | undefined): ThreadView {
  if (view === undefined) throw new Error("The thread view has not arrived yet");
  return view;
}
