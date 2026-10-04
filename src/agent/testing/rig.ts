import type { TestContext } from "node:test";
import type { AgentConnection, SessionHandle } from "../../contracts/agent/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { type JoinOptions, type RunningAgent, startAgent } from "../index.ts";
import { attachThread, closeAfter } from "./attach.ts";
import { type ChatServer, startChatServer } from "./chat-server.ts";
import { type FauxScenario, fauxModels, type Script } from "./index.ts";
import { SCOUT } from "./names.ts";
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
  /** Anything about how the agent takes part in the network. */
  join?: Partial<JoinOptions>;
}

/** The agent, and the person who runs the gateway to talk to it. */
export interface AgentRig extends Talk {
  readonly home: string;
  readonly agent: RunningAgent;
  readonly chat: ChatServer;
  /** What the agent reported, apart from the engine's own notices being among them. Empty when all went well. */
  readonly reports: unknown[];
  /** Connect to the agent's API and attach to the session behind a thread. The connection is closed when the test ends. */
  attach(threadId?: string): Promise<{ connection: AgentConnection; session: SessionHandle }>;
}

/**
 * An agent on a home of its own, with a scripted model, taking part in the
 * network: it joins the real gateway's roster, registers there and finds the
 * real chat server through it, where the person who runs the gateway has a DM
 * with it. All of it is stopped when the test ends if it is still running. A
 * second rig can be given the first one's home and chat server, to see an
 * agent that is started again.
 */
export async function startAgentRig(t: TestContext, options: AgentRigOptions = {}): Promise<AgentRig> {
  useRuntimeDir(t);
  const home = options.home ?? tempDir(t, "agent");
  const chat = options.chat ?? (await startChatServer(t));
  const reports: unknown[] = [];
  const agent = closeAfter(
    t,
    await startAgent({
      home,
      name: SCOUT,
      ...fauxModels({
        home,
        scenario: options.scenario ?? (options.script === undefined ? "mixed" : undefined),
        script: options.script,
        tokensPerSecond: options.tokensPerSecond,
        tokenSize: options.tokenSize,
      }),
      onReport: (error) => reports.push(error),
      join: {
        backoff: () => backoff({ firstMs: 5, maxMs: 20 }),
        ...options.join,
      },
    }),
  );
  const talk = await talkTo(chat);

  return {
    ...talk,
    home,
    agent,
    chat,
    reports,
    async attach(threadId = talk.thread.id) {
      const attached = await attachThread(home, threadId);
      stopAfter(t, () => attached.connection.close().catch(() => undefined));
      return attached;
    },
  };
}
