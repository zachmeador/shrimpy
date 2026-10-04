import type { TestContext } from "node:test";
import type { AgentConnection, SessionHandle } from "../../contracts/agent/index.ts";
import type { Message, Receipt, Thread } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import { type StandInChat, startStandInChat } from "../../contracts/chat/testing/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { eventually, stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { type JoinOptions, type RunningAgent, startAgent } from "../index.ts";
import { attachThread, closeAfter } from "./attach.ts";
import { type FauxScenario, fauxModels, type Script } from "./index.ts";
import { scout, zach } from "./names.ts";

export interface AgentRigOptions {
  /** What the model does; `mixed` unless the test says otherwise. */
  scenario?: FauxScenario;
  script?: Script;
  tokensPerSecond?: number;
  tokenSize?: { min: number; max: number };
  /** A home that already has an agent's history, for a second agent on it. */
  home?: string;
  /** A stand-in chat that already has things said in it, for a second agent on it. */
  chat?: StandInChat;
  /** Anything about how the agent takes part in chat. */
  join?: Partial<JoinOptions>;
}

export interface AgentRig {
  readonly home: string;
  readonly agent: RunningAgent;
  readonly chat: StandInChat;
  /** The main thread of the DM between Zach and the agent. */
  readonly thread: Thread;
  /** What the agent reported, apart from the engine's own notices being among them. Empty when all went well. */
  readonly reports: unknown[];
  /** Zach starts a side thread in the DM. */
  newThread(name?: string): Promise<Thread>;
  /** Zach says something in a thread, the DM's main thread unless another is given. */
  say(text: string, threadId?: string): Message;
  /** Everything said in a thread, oldest first. */
  said(threadId?: string): Message[];
  /** What the agent said in a thread, oldest first. */
  replies(threadId?: string): Message[];
  /** Resolve with the receipt the agent leaves on a message. */
  receiptOn(message: Message): Promise<Receipt>;
  /** Connect to the agent's API and attach to the session behind a thread. The connection is closed when the test ends. */
  attach(threadId?: string): Promise<{ connection: AgentConnection; session: SessionHandle }>;
}

/**
 * An agent on a home of its own, with a scripted model, taking part in a
 * stand-in chat where Zach has a DM with it. It returns once the agent is
 * reading its feed. Both are stopped when the test ends if they are still
 * running. A second rig can be given the first one's home and chat, to see an
 * agent that is started again.
 */
export async function startAgentRig(t: TestContext, options: AgentRigOptions = {}): Promise<AgentRig> {
  useRuntimeDir(t);
  const home = options.home ?? tempDir(t, "agent");
  const chat = options.chat ?? (await startStandInChat(t));
  const { thread } = chat.chat.dm(zach, scout);
  const reading = chat.chat.calls("feed");
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
        openChat: () => connectLocal(chat.endpoint),
        backoff: () => backoff({ firstMs: 5, maxMs: 20 }),
        ...options.join,
      },
    }),
  );
  await eventually(() => chat.chat.calls("feed"), (calls) => calls > reading, {
    what: "the agent to start reading the feed",
  });

  const said = (threadId = thread.id): Message[] => chat.chat.messages(threadId);
  return {
    home,
    agent,
    chat,
    thread,
    reports,
    async newThread(name) {
      const person = await chat.join(zach);
      return person.chat.createThread(thread.channelId, name ?? null);
    },
    say: (text, threadId = thread.id) => chat.chat.say(zach, threadId, text),
    said,
    replies: (threadId) => said(threadId).filter((message) => message.author.id === scout.id),
    receiptOn: (message) =>
      eventually(
        () => chat.chat.messages().find((candidate) => candidate.id === message.id)?.receipts.find((r) => r.memberId === scout.id),
        (receipt) => receipt !== undefined,
        { what: `a receipt on "${message.text}"` },
      ) as Promise<Receipt>,
    async attach(threadId = thread.id) {
      const attached = await attachThread(home, threadId);
      stopAfter(t, () => attached.connection.close().catch(() => undefined));
      return attached;
    },
  };
}
