import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { type ByteTransportFactory, DisconnectedError } from "@earendil-works/pi-client";
import { openRoutedConnection } from "../../lib/connection/index.ts";
import { SessionDirectory, SessionService } from "./services.ts";
import type { SessionSummary, SessionView, Settlement } from "./view.ts";

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
  readonly id: string;
  readonly view: SessionView;
  /** Calls `listener` with the current view, then after every change. */
  subscribe(listener: (view: SessionView) => void): () => void;
  steer(text: string, requestId?: string): Promise<{ submission: number }>;
  /** Resolves when the submission has ended. A client that goes away while waiting does not stop the work. */
  wait(submission: number): Promise<Settlement>;
  abort(): Promise<void>;
}

export interface AgentConnection {
  sessions(): Promise<SessionSummary[]>;
  /** Watch one session. A connection watches one at a time; attaching again switches. */
  attach(sessionId: string): Promise<SessionHandle>;
  /** Called once if the connection drops. Nothing reconnects by itself. */
  onDisconnect(listener: (reason: Error | undefined) => void): void;
  close(): Promise<void>;
}

const context = BACKGROUND_CONTEXT;

export async function connectAgent(options: {
  serverId: string;
  transportFactory: ByteTransportFactory;
}): Promise<AgentConnection> {
  const connection = await openRoutedConnection({
    ...options,
    service: SessionDirectory,
    session: SessionService,
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
    sessions: () => guarded(() => directory.list(context)),
    attach: (sessionId) =>
      guarded(async () => {
        const { service: session } = await connection.attach(sessionId);
        return {
          id: sessionId,
          get view() {
            return currentView(session.state.value);
          },
          subscribe: (listener) => session.state.subscribe((value) => listener(value)),
          steer: (text, requestId) => guarded(() => session.steer(text, requestId ?? null, context)),
          wait: (submission) => guarded(() => session.wait(submission, context)),
          abort: () => guarded(() => session.abort(context)),
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

function currentView(view: SessionView | undefined): SessionView {
  if (view === undefined) throw new Error("The session view has not arrived yet");
  return view;
}
