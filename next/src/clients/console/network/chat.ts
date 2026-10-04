import {
  type ChatClient,
  type ChatConnection,
  connectChat,
  type Member,
  type ThreadView,
} from "../../../contracts/chat/index.ts";
import type { Backoff } from "../../../lib/retry/index.ts";
import { converge } from "./converge.ts";
import { keepConnection } from "./keep.ts";
import type { RegistryLink } from "./registry.ts";
import { Down, type LinkStatus, type Problem, problemOf } from "./status.ts";
import type { Transports } from "./transports.ts";

/** What the followed thread looks like now, or why it could not be followed. */
export type ThreadUpdate = { threadId: string; view: ThreadView } | { threadId: string; problem: Problem };

export interface ChatLinkOptions {
  /** Who the console is in chat: what it says on every connection before anything else. */
  me: Member;
  registry: RegistryLink;
  transports: Transports;
  /** Told of each view of the followed thread, from the first, and of a thread that could not be followed. */
  onThread(update: ThreadUpdate): void;
  /** The pauses between attempts. Tests shorten them. */
  backoff?: Backoff;
}

/** The console's way to the chat server, whether or not it is reachable right now. */
export interface ChatLink {
  status(): LinkStatus;
  /** Tell `listener` each time the status changes. Returns what stops that. */
  onStatus(listener: (status: LinkStatus) => void): () => void;
  /** Run `use` on the connection. When there is none it fails with `Down`, saying why, instead of waiting for one. */
  call<T>(use: (chat: ChatClient) => Promise<T>): Promise<T>;
  /**
   * Follow a thread: its live view is passed on from now on, and again after
   * each time the connection comes back. Following another thread, or none,
   * lets go of this one.
   */
  follow(threadId: string | undefined): void;
  /** Leave chat and stop trying to reach it. */
  close(): Promise<void>;
}

/**
 * Keep a connection to the chat server the gateway lists: connect, say who the
 * console is, hold the connection, and keep following the thread that is wanted
 * across losses.
 */
export function keepChat(options: ChatLinkOptions): ChatLink {
  let wanted: string | undefined;
  let following: { id: string; connection: ChatConnection; stop: () => void } | undefined;
  // A thread that could not be followed is not tried again until it is asked for again, or the connection is.
  let refused: string | undefined;

  const settle = converge(
    async () => {
      const connection = keeper.current();
      if (connection === undefined) return;
      const attached = following;
      if (attached !== undefined && attached.id === wanted && attached.connection === connection) return;
      attached?.stop();
      following = undefined;
      if (wanted === undefined) {
        if (attached?.connection === connection) await connection.detach();
        return;
      }
      const id = wanted;
      if (refused === id) return;
      try {
        const handle = await connection.attach(id);
        if (wanted !== id || keeper.current() !== connection) return;
        following = { id, connection, stop: handle.subscribe((view) => options.onThread({ threadId: id, view })) };
      } catch (error) {
        refused = id;
        options.onThread({ threadId: id, problem: problemOf(error) });
      }
    },
    (error) => options.onThread({ threadId: wanted ?? "", problem: problemOf(error) }),
  );

  const keeper = keepConnection<ChatConnection>({
    backoff: options.backoff,
    async open(signal, waiting) {
      const registration = await options.registry.untilListed(
        (program) => program.kind === "chat",
        signal,
        () => waiting({ kind: "not-registered" }),
      );
      waiting({ kind: "connecting" });
      const connection = await connectChat({
        serverId: registration.serverId,
        transportFactory: options.transports.program(registration),
        signal,
      }).catch((error: unknown) => {
        if (signal.aborted) throw error;
        throw new Down(
          { kind: "unreachable", message: `Could not reach the chat server at ${registration.socket}: ${(error as Error).message}` },
          { cause: error },
        );
      });
      try {
        await connection.chat.identify(options.me, signal);
      } catch (error) {
        await connection.close().catch(() => undefined);
        throw error;
      }
      return connection;
    },
    onUp() {
      refused = undefined;
      void settle();
      return () => {
        following?.stop();
        following = undefined;
      };
    },
  });

  return {
    status: () => keeper.status(),
    onStatus: (listener) => keeper.onStatus(listener),
    async call(use) {
      const connection = keeper.current();
      if (connection === undefined) {
        const status = keeper.status();
        throw new Down(status.state === "down" ? status.why : { kind: "lost" });
      }
      return use(connection.chat);
    },
    follow(threadId) {
      wanted = threadId;
      refused = undefined;
      void settle();
    },
    close: () => keeper.close(),
  };
}
