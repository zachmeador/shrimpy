import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ByteTransportFactory, DisconnectedError } from "@earendil-works/pi-client";
import { openRoutedConnection, received } from "../../lib/connection/index.ts";
import { SessionDirectory, SessionService } from "./services.ts";
import type {
  AgentModels,
  Member,
  Occurrence,
  Reloaded,
  SessionSummary,
  SessionView,
  Settlement,
  TriggerDetail,
  TriggerSummary,
} from "./view.ts";

/** The connection to the agent dropped while a call was waiting for its answer. */
export class AgentConnectionLostError extends Error {
  constructor(options?: ErrorOptions) {
    super(
      "Lost the connection to the agent. If it stopped, the work that was running resumes when it starts again.",
      options,
    );
    this.name = "AgentConnectionLostError";
  }
}

/** One attached session: its view, updates, and control. */
export interface SessionHandle {
  /** The session's address, which is how it was attached. */
  readonly id: string;
  readonly view: SessionView;
  /** Calls `listener` with the current view, then after every change. */
  subscribe(listener: (view: SessionView) => void): () => void;
  steer(text: string, requestId?: string): Promise<{ submission: number }>;
  /** Resolves when the submission has ended. A client that goes away while waiting does not stop the work. */
  wait(submission: number): Promise<Settlement>;
  stop(): Promise<void>;
}

export interface AgentConnection {
  /**
   * Come in with a ticket from the gateway, before anything else. A connection
   * made through the gateway by the agent's name must, and `reachProgram` does
   * it; one made by the home's path needs none. See `SessionDirectory.enter`.
   */
  enter(ticket: string): Promise<Member>;
  sessions(): Promise<SessionSummary[]>;
  /**
   * Watch a session by its address: the thread's ID for a session behind a
   * thread. A session the agent has not made yet is refused. A connection
   * watches one at a time; attaching again switches.
   */
  attach(session: string): Promise<SessionHandle>;
  /** The models the agent can use now, and the one its sessions follow by default. See `SessionDirectory.models`. */
  models(): Promise<AgentModels>;
  /** Every standing trigger of the agent. See `SessionDirectory.triggers`. */
  triggers(): Promise<TriggerSummary[]>;
  /** One trigger, with its definition and recent occurrences. See `SessionDirectory.trigger`. */
  trigger(name: string): Promise<TriggerDetail>;
  /** Fire a trigger once now. See `SessionDirectory.fire`. */
  fire(name: string): Promise<Occurrence>;
  /** Make the agent read its home's files again now, rather than at its next look. See `SessionDirectory.reload`. */
  reload(): Promise<Reloaded>;
  /** Called once if the connection drops. Nothing reconnects by itself. */
  onDisconnect(listener: (reason: Error | undefined) => void): void;
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

export async function connectAgent(options: {
  serverId: string;
  transportFactory: ByteTransportFactory;
  /** Abort to give up while connecting, even on an agent that stopped answering. */
  signal?: AbortSignal;
}): Promise<AgentConnection> {
  const connection = await openRoutedConnection({
    ...options,
    service: SessionDirectory,
    route: SessionService,
  });
  const directory = connection.service;

  let lost = false;
  let closed = false;
  let calls = 0;
  connection.onDisconnect(() => {
    lost = true;
  });
  // Calls that fail because the connection dropped fail the same way, with a message a person can use.
  const guarded = async <T>(call: () => Promise<T>): Promise<T> => {
    calls += 1;
    try {
      return await call();
    } catch (error) {
      const dropped = !closed && (lost || error instanceof DisconnectedError);
      throw dropped ? new AgentConnectionLostError({ cause: error }) : error;
    } finally {
      calls -= 1;
    }
  };

  return {
    enter: (ticket) => guarded(() => directory.enter(ticket, context)),
    sessions: () => guarded(() => directory.list(context)),
    models: () => guarded(() => directory.models(context)),
    reload: () => guarded(() => directory.reload(context)),
    triggers: () => guarded(() => directory.triggers(context)),
    trigger: (name) => guarded(() => directory.trigger(name, context)),
    fire: (name) => guarded(() => directory.fire(name, context)),
    attach: (address) =>
      guarded(async () => {
        const { service: session } = await connection.attach(address);
        return {
          id: address,
          get view() {
            return received(session.state, "session view");
          },
          subscribe: (listener) => session.state.subscribe((value) => listener(value)),
          steer: (text, requestId) => guarded(() => session.steer(text, requestId ?? null, context)),
          wait: (submission) => guarded(() => session.wait(submission, context)),
          stop: () => guarded(() => session.stop(context)),
        };
      }),
    onDisconnect: (listener) => connection.onDisconnect(listener),
    async close() {
      closed = true;
      // Saying goodbye would wait behind a call that is still waiting for its answer, such as a `wait`.
      // The server lets go of what a dropped connection held, so with calls pending the connection is dropped.
      await connection.close({ goodbye: calls === 0 });
    },
  };
}
