import { createRemoteServiceBinding } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ByteTransportFactory,
  Client,
  createClientServiceTransport,
  DisconnectedError,
} from "@earendil-works/pi-client";
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
  const { serverId } = options;
  const client = await Client.connect({ serverId, transportFactory: options.transportFactory });
  const agentScope = createRemoteServiceBinding({
    services: [SessionDirectory],
    transport: createClientServiceTransport(client, () => ({ serverId })),
    bound: true,
  });
  // ready() only waits for services already acquired, so acquire first.
  const directory = agentScope.use(SessionDirectory);
  await agentScope.ready(context);

  let sessionScope: ReturnType<typeof createRemoteServiceBinding> | undefined;
  let lost = false;
  let closed = false;
  let calls = 0;
  const disconnects: ((reason: Error | undefined) => void)[] = [];
  client.onConnectionStateChange(({ state, error }) => {
    if (state !== "disconnected") return;
    lost = true;
    for (const listener of disconnects) listener(error);
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

  const releaseSession = async (): Promise<void> => {
    const scope = sessionScope;
    sessionScope = undefined;
    if (scope === undefined) return;
    await scope.dispose(context).catch(() => undefined);
    await directory.detach(context).catch(() => undefined);
  };

  return {
    sessions: () => guarded(() => directory.list(context)),
    attach: (sessionId) =>
      guarded(async () => {
        await releaseSession();
        const routed = waitForRoute(client);
        await directory.attach(sessionId, context);
        await routed;
        const scope = createRemoteServiceBinding({
          services: [SessionService],
          transport: createClientServiceTransport(client, () => client.attachment),
          bound: true,
        });
        sessionScope = scope;
        const session = scope.use(SessionService);
        await scope.ready(context);
        return {
          id: sessionId,
          get view() {
            return currentView(session.state.value);
          },
          subscribe(listener) {
            listener(currentView(session.state.value));
            return session.state.subscribe((value) => listener(value));
          },
          steer: (text, requestId) => guarded(() => session.steer(text, requestId ?? null, context)),
          wait: (submission) => guarded(() => session.wait(submission, context)),
          abort: () => guarded(() => session.abort(context)),
        };
      }),
    onDisconnect(listener) {
      disconnects.push(listener);
    },
    async close() {
      // Saying goodbye would wait behind a call that is still waiting for its answer, such as a `wait`.
      // The server lets go of what a dropped connection held, so with calls pending the connection is dropped.
      const goodbye = calls === 0;
      closed = true;
      if (goodbye) {
        await releaseSession();
        await agentScope.dispose(context).catch(() => undefined);
      }
      await client.dispose();
    },
  };
}

/** The server announces the attached route out of band, after `attach` resolves or before. */
function waitForRoute(client: Client): Promise<void> {
  return new Promise((resolve) => {
    const stop = client.onAttachmentChange((attachment) => {
      if (attachment === undefined) return;
      stop();
      resolve();
    });
  });
}

function currentView(view: SessionView | undefined): SessionView {
  if (view === undefined) throw new Error("The session view has not arrived yet");
  return view;
}
