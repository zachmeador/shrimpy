import type { TestContext } from "node:test";
import type { AgentConnection, SessionHandle } from "../../contracts/agent/index.ts";
import type { Member, Message, Thread } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import { backoff } from "../../lib/retry/index.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { type JoinOptions, type RunningAgent, startAgent } from "../index.ts";
import { attachThread, closeAfter } from "./attach.ts";
import { type ChatServer, startChatServer } from "./chat-server.ts";
import { type FauxScenario, fauxModels, type Script } from "./index.ts";
import { scout } from "./names.ts";
import { type Talk, talkTo } from "./talk.ts";

export interface AgentRigOptions {
  /** What the model does; `mixed` unless the test says otherwise. */
  scenario?: FauxScenario;
  script?: Script;
  tokensPerSecond?: number;
  tokenSize?: { min: number; max: number };
  /** A home that already has an agent's history, for a second agent on it. */
  home?: string;
  /** A chat server that already has things said in it, for a second agent on it. */
  chat?: ChatServer;
  /** Anything about how the agent takes part in chat. */
  join?: Partial<JoinOptions>;
}

/** The agent, and Zach to talk to it. */
export interface AgentRig extends Talk {
  readonly home: string;
  readonly agent: RunningAgent;
  readonly chat: ChatServer;
  /** What the agent reported, apart from the engine's own notices being among them. Empty when all went well. */
  readonly reports: unknown[];
  /** A DM between two other members, made if need be, and what has been said in its main thread. */
  dm(a: Member, b: Member): Promise<{ thread: Thread; said(): Promise<Message[]> }>;
  /** Connect to the agent's API and attach to the session behind a thread. The connection is closed when the test ends. */
  attach(threadId?: string): Promise<{ connection: AgentConnection; session: SessionHandle }>;
}

/**
 * An agent on a home of its own, with a scripted model, taking part in chat on
 * the real chat server, where Zach has a DM with it. Both are stopped when the
 * test ends if they are still running. A second rig can be given the first
 * one's home and chat server, to see an agent that is started again.
 */
export async function startAgentRig(t: TestContext, options: AgentRigOptions = {}): Promise<AgentRig> {
  useRuntimeDir(t);
  const home = options.home ?? tempDir(t, "agent");
  const chat = options.chat ?? (await startChatServer(t));
  const talk = await talkTo(chat);
  const reports: unknown[] = [];
  const agent = closeAfter(
    t,
    await startAgent({
      home,
      name: scout.name,
      ...fauxModels({
        home,
        scenario: options.scenario ?? (options.script === undefined ? "mixed" : undefined),
        script: options.script,
        tokensPerSecond: options.tokensPerSecond,
        tokenSize: options.tokenSize,
      }),
      onReport: (error) => reports.push(error),
      join: {
        register: false,
        // Read when the agent connects, so a chat server that comes back is found where it is.
        openChat: () => connectLocal(chat.endpoint),
        backoff: () => backoff({ firstMs: 5, maxMs: 20 }),
        ...options.join,
      },
    }),
  );

  return {
    ...talk,
    home,
    agent,
    chat,
    reports,
    async dm(a, b) {
      const connection = await chat.join(a);
      const channel = await connection.chat.openDm(b);
      const thread = (await connection.chat.threads(channel.id)).find((candidate) => candidate.main);
      if (thread === undefined) throw new Error(`The DM ${channel.id} has no main thread`);
      return { thread, said: () => connection.chat.read(thread.id, null, 200) };
    },
    async attach(threadId = talk.thread.id) {
      const attached = await attachThread(home, threadId);
      stopAfter(t, () => attached.connection.close().catch(() => undefined));
      return attached;
    },
  };
}
