import { writeFileSync } from "node:fs";
import type { TestContext } from "node:test";
import { backoff } from "../../lib/retry/index.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { homePaths } from "../home/index.ts";
import { type JoinOptions, type RunningAgent, startAgent } from "../index.ts";
import { type AgentConnection, attachThread, closeAfter, connectAgent, type SessionHandle } from "./attach.ts";
import { type ChatServer, startChatServer } from "./chat-server.ts";
import { type FauxScenario, fauxModels, releaseGate, type Script } from "./index.ts";
import { SCOUT } from "./names.ts";
import { type Talk, talkTo } from "../../contracts/chat/testing/index.ts";

export interface AgentRigOptions {
  /** The agent's name: Scout unless the test says otherwise, as for a second agent on the same chat server. */
  name?: string;
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
  /** The shortest a trigger may repeat at, in milliseconds. A test that fires triggers makes it short. */
  shortestEveryMs?: number;
  /** The shortest the agent may wait for another agent's answer, in milliseconds. A test whose question times out makes it short. */
  shortestWaitMs?: number;
  /** How often the agent looks at its files, in milliseconds. A test that changes them while the agent runs makes it short. */
  lookEveryMs?: number;
}

/** The agent, and you, to talk to it. */
export interface AgentRig extends Talk {
  readonly home: string;
  readonly agent: RunningAgent;
  readonly chat: ChatServer;
  /** What the agent reported, apart from the engine's own notices being among them. Empty when all went well. */
  readonly reports: unknown[];
  /** Link to the agent by the home's path and hold the session behind a thread. Closed when the test ends. */
  attach(threadId?: string): Promise<{ connection: AgentConnection; session: SessionHandle }>;
  /** Link to the agent by the home's path. Closed when the test ends. */
  connect(): Promise<AgentConnection>;
}

/**
 * An agent on a home of its own, with a scripted model, taking part in the
 * network: it links to the real gateway, joins its roster and finds the real
 * chat server through it, where you have a DM with it. All of it is stopped
 * when the test ends if it is still running, and a model held at the home's
 * gate is let go first, so that stopping the agent never waits for it. A second
 * rig can be given the first one's home and chat server, to see an agent that
 * is started again.
 */
/** A home of its own with only an `agent.json` that names the agent, where a test sets what wakes it or how it looks. */
function newHome(t: TestContext, name: string): string {
  const home = tempDir(t, "agent");
  writeFileSync(homePaths(home).config, JSON.stringify({ name }));
  return home;
}

export async function startAgentRig(t: TestContext, options: AgentRigOptions = {}): Promise<AgentRig> {
  useRuntimeDir(t);
  const home = options.home ?? newHome(t, options.name ?? SCOUT);
  const chat = options.chat ?? (await startChatServer(t));
  const reports: unknown[] = [];
  const agent = closeAfter(
    t,
    await startAgent({
      home,
      name: options.name ?? SCOUT,
      ...fauxModels({
        home,
        scenario: options.scenario ?? (options.script === undefined ? "mixed" : undefined),
        script: options.script,
        tokensPerSecond: options.tokensPerSecond,
        tokenSize: options.tokenSize,
      }),
      onReport: (error) => reports.push(error),
      ...(options.shortestEveryMs === undefined ? {} : { shortestEveryMs: options.shortestEveryMs }),
      ...(options.shortestWaitMs === undefined ? {} : { shortestWaitMs: options.shortestWaitMs }),
      ...(options.lookEveryMs === undefined ? {} : { lookEveryMs: options.lookEveryMs }),
      join: {
        backoff: () => backoff({ firstMs: 5, maxMs: 20 }),
        ...options.join,
      },
    }),
  );
  // Stops run newest first, so the gate opens before the agent is stopped.
  stopAfter(t, () => releaseGate(home));
  const talk = await talkTo(t, options.name ?? SCOUT);

  return {
    ...talk,
    home,
    agent,
    chat,
    reports,
    attach: (threadId = talk.thread.id) => attachThread(t, home, threadId),
    connect: () => connectAgent(t, home),
  };
}
