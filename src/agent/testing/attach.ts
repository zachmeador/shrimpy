import { randomUUID } from "node:crypto";
import type { TestContext } from "node:test";
import type { Host, Reference } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  Agent,
  type AgentModel,
  type DefaultModel,
  type ModelId,
  type HomeEntry,
  type HomeFile,
  type Occurrence,
  type Pigment,
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
  models(): Promise<AgentModel[]>;
  /** The model its sessions follow by default, as the agent says it now, or null when the caller may not watch it. */
  model(): DefaultModel | null;
  setModel(model: ModelId | null): Promise<Reloaded>;
  triggers(): Promise<TriggerSummary[]>;
  trigger(name: string): Promise<TriggerDetail>;
  fire(name: string): Promise<Occurrence>;
  reload(): Promise<Reloaded>;
  /** How the agent looks now, which every caller sees. */
  look(): { sigil: string[] | null; pigment: Pigment | null };
  /** The entries of a folder of the agent's home. */
  folder(path: string): Promise<HomeEntry[]>;
  /** A file of the agent's home. */
  file(path: string): Promise<HomeFile>;
  close(): Promise<void>;
}

function viewOf(session: Reference<typeof Session>): SessionView {
  const status = session.status.value;
  if (status === null) throw new Error("The session is refused, so it has no view.");
  const { items, before } = session.window.value;
  return { items, before, status };
}

/** The session `address` of the agent `agent`, as `host` holds it. */
export async function holdSession(host: Host<Principal, Revocation>, agent: string, address: string): Promise<SessionHandle> {
  const session = await host.get(Session, { agent, session: address }, context);
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

/** The agent `agent` (its member ID through the gateway, or `HOME_AGENT` on its home socket), as `host` holds it, closed with `close`. */
export async function holdAgent(host: Host<Principal, Revocation>, agent: string, close: () => Promise<void>): Promise<AgentConnection> {
  const held = await host.get(Agent, { agent }, context);
  const allowed = (): void => unlessRefused(held.refusal.value);
  return {
    name: agent,
    async sessions() {
      allowed();
      return held.sessions.value;
    },
    attach: (address) => holdSession(host, agent, address),
    models: async () => valueOf(await held.models(context)),
    model: () => held.model.value,
    setModel: async (model) => valueOf(await held.setModel({ model }, context)),
    async triggers() {
      allowed();
      return held.triggers.value;
    },
    trigger: async (trigger) => valueOf(await held.trigger({ name: trigger }, context)),
    fire: async (trigger) => valueOf(await held.fire({ name: trigger }, context)),
    reload: async () => valueOf(await held.reload(context)),
    look: () => ({ sigil: held.sigil.value, pigment: held.pigment.value }),
    folder: async (path) => valueOf(await held.folder({ path }, context)),
    file: async (path) => valueOf(await held.file({ path }, context)),
    async close() {
      held.release();
      await close();
    },
  };
}

/** Link to the agent that owns `home` by the home's path, and hold it. Closed when the test ends. */
export async function connectAgent(t: TestContext, home: string): Promise<AgentConnection> {
  const client = await connectHome(home);
  stopAfter(t, () => client.close());
  return holdAgent(client.host, client.agent, () => client.close());
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
