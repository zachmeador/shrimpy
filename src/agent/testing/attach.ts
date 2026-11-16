import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Host, Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  Agent,
  type AgentModels,
  type Occurrence,
  type Reloaded,
  Session,
  type SessionItem,
  type SessionPage,
  type SessionStatus,
  type SessionSummary,
  type Settlement,
  type TriggerDetail,
  type TriggerSummary,
} from "../../contracts/agent/index.ts";
import { connectHome } from "../../contracts/agent/node.ts";
import { type Principal, type Revocation, unlessRefused, valueOf } from "../../contracts/gateway/index.ts";
import { refuse } from "../../lib/refusal/index.ts";
import { stopAfter } from "../../lib/testing/index.ts";

const context = BACKGROUND_CONTEXT;

/** A session as a test reads it: its newest items, the entry before them and what it is doing. */
export interface SessionView {
  items: SessionItem[];
  before: number | null;
  status: SessionStatus;
}

/** One session a test holds: its view kept live, and control over its work. A refusal is thrown as a `Refusal`. */
export interface SessionHandle {
  /** The session's address, which is how it was held. */
  readonly id: string;
  readonly view: SessionView;
  /** Calls `listener` with the current view, then after every change. */
  subscribe(listener: (view: SessionView) => void): () => void;
  steer(text: string, requestId?: string): Promise<{ submission: number }>;
  /** Resolves when the submission has ended. A client that goes away while waiting does not stop the work. */
  wait(submission: number): Promise<Settlement>;
  stop(): Promise<void>;
  /** The items of up to `limit` entries from the entry `before` back. */
  read(before: number, limit: number): Promise<SessionPage>;
  /** Let go of the session. */
  release(): void;
}

/** One agent a test holds, through whatever its host is linked to. A refusal is thrown as a `Refusal`. */
export interface AgentConnection {
  /** The name the agent answers to. */
  readonly name: string;
  sessions(): Promise<SessionSummary[]>;
  /** Hold a session by its address, refused when the agent has not made it or the caller may not watch it. */
  attach(session: string): Promise<SessionHandle>;
  models(): Promise<AgentModels>;
  triggers(): Promise<TriggerSummary[]>;
  trigger(name: string): Promise<TriggerDetail>;
  fire(name: string): Promise<Occurrence>;
  reload(): Promise<Reloaded>;
  close(): Promise<void>;
}

function viewOf(session: Reference<typeof Session>): SessionView {
  const status = session.status.value;
  if (status === null) throw new Error("The session is refused, so it has no view.");
  const { items, before } = session.window.value;
  return { items, before, status };
}

/** The session `address` of the agent `name`, as `host` holds it. */
export async function holdSession(host: Host<Principal, Revocation>, name: string, address: string): Promise<SessionHandle> {
  const session = await host.get(Session, { agent: name, session: address }, context);
  const refusal = session.refusal.value;
  if (refusal !== null) {
    session.release();
    refuse(refusal.words);
  }
  return {
    id: address,
    get view() {
      return viewOf(session);
    },
    subscribe(listener) {
      const stops: (() => void)[] = [];
      let stopped = false;
      const tell = (): void => {
        if (!stopped && session.status.value !== null) listener(viewOf(session));
      };
      for (const member of [session.window, session.status] as const) {
        void member.watch(context).then((watch) => {
          if (stopped) return void watch.stop();
          stops.push(() => void watch.stop());
          watch.start(async () => tell());
        });
      }
      tell();
      return () => {
        stopped = true;
        for (const stop of stops.splice(0)) stop();
      };
    },
    steer: async (text, requestId) => valueOf(await session.steer({ text, request: requestId ?? randomUUID() }, context)),
    wait: async (submission) => valueOf(await session.wait({ submission }, context)),
    stop: async () => {
      valueOf(await session.stop(context));
    },
    read: async (before, limit) => valueOf(await session.read({ before, limit }, context)),
    release: () => session.release(),
  };
}

/** The agent `name`, as `host` holds it, closed with `close`. */
export async function holdAgent(host: Host<Principal, Revocation>, name: string, close: () => Promise<void>): Promise<AgentConnection> {
  const agent = await host.get(Agent, { agent: name }, context);
  const allowed = (): void => unlessRefused(agent.refusal.value);
  return {
    name,
    async sessions() {
      allowed();
      return agent.sessions.value;
    },
    attach: (address) => holdSession(host, name, address),
    models: async () => valueOf(await agent.models(context)),
    async triggers() {
      allowed();
      return agent.triggers.value;
    },
    trigger: async (trigger) => valueOf(await agent.trigger({ name: trigger }, context)),
    fire: async (trigger) => valueOf(await agent.fire({ name: trigger }, context)),
    reload: async () => valueOf(await agent.reload(context)),
    async close() {
      agent.release();
      await close();
    },
  };
}

/** Link to the agent that owns `home` by the home's path, and hold it. Closed when the test ends. */
export async function connectAgent(t: TestContext, home: string): Promise<AgentConnection> {
  const client = await connectHome(home);
  stopAfter(t, () => client.close());
  return holdAgent(client.host, client.name, () => client.close());
}

/** Stop `agent` when the test ends, whether or not the test passed. Stopping twice is fine. */
export function closeAfter<T extends { close(options?: { now?: boolean }): Promise<void> }>(
  t: TestContext,
  agent: T,
): T {
  stopAfter(t, () => agent.close({ now: true }));
  return agent;
}

/** Link to the agent that owns `home` by the home's path and hold the session behind a thread. */
export async function attachThread(
  t: TestContext,
  home: string,
  threadId: string,
): Promise<{ connection: AgentConnection; session: SessionHandle }> {
  const connection = await connectAgent(t, home);
  try {
    return { connection, session: await connection.attach(threadId) };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
