import { createRemoteServiceBinding } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type ByteTransportFactory,
  Client,
  createClientServiceTransport,
} from "@earendil-works/pi-client";
import { SessionDirectory, SessionService } from "./services.ts";
import type { SessionSummary, SessionView } from "./view.ts";

/** One attached session: its view, updates, and control. */
export interface SessionHandle {
  readonly id: string;
  readonly view: SessionView;
  /** Calls `listener` with the current view, then after every change. */
  subscribe(listener: (view: SessionView) => void): () => void;
  steer(text: string, requestId?: string): Promise<{ submission: number }>;
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
  const disconnects: ((reason: Error | undefined) => void)[] = [];
  client.onConnectionStateChange(({ state, error }) => {
    if (state !== "disconnected") return;
    for (const listener of disconnects) listener(error);
  });

  const releaseSession = async (): Promise<void> => {
    const scope = sessionScope;
    sessionScope = undefined;
    if (scope === undefined) return;
    await scope.dispose(context).catch(() => undefined);
    await directory.detach(context).catch(() => undefined);
  };

  return {
    sessions: () => directory.list(context),
    async attach(sessionId) {
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
        steer: (text, requestId) => session.steer(text, requestId ?? null, context),
        abort: () => session.abort(context),
      };
    },
    onDisconnect(listener) {
      disconnects.push(listener);
    },
    async close() {
      await releaseSession();
      await agentScope.dispose(context).catch(() => undefined);
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
