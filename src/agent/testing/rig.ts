import type { TestContext } from "node:test";
import type { AgentConnection, SessionHandle } from "../../contracts/agent/index.ts";
import type { Member, Message, Receipt, Thread } from "../../contracts/chat/index.ts";
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
  /** A chat that already has things said in it, for a second agent on it. */
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
  /** A DM between two other members, made if need be, and what has been said in its main thread. */
  dm(a: Member, b: Member): Promise<{ thread: Thread; said(): Promise<Message[]> }>;
  /** Zach says something in a thread, the DM's main thread unless another is given. */
  say(text: string, threadId?: string): Promise<Message>;
  /** Everything said in a thread, oldest first. */
  said(threadId?: string): Promise<Message[]>;
  /** What the agent said in a thread, oldest first. */
  replies(threadId?: string): Promise<Message[]>;
  /** Who chat says is working in a thread now. */
  working(threadId?: string): Promise<string[]>;
  /** Resolve once the agent is marked as working in a thread. */
  untilWorking(threadId?: string): Promise<void>;
  /** Resolve once nobody is marked as working in a thread. */
  untilIdle(threadId?: string): Promise<void>;
  /** Resolve with the receipt the agent leaves on a message. */
  receiptOn(message: Message, timeoutMs?: number): Promise<Receipt>;
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

  const said = (threadId = thread.id): Promise<Message[]> => Promise.resolve(chat.chat.messages(threadId));
  const working = (threadId = thread.id): Promise<string[]> =>
    Promise.resolve(chat.chat.working(threadId).map((mark) => mark.memberId));
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
    async dm(a, b) {
      const { thread: other } = chat.chat.dm(a, b);
      return { thread: other, said: () => said(other.id) };
    },
    say: (text, threadId = thread.id) => Promise.resolve(chat.chat.say(zach, threadId, text)),
    said,
    async replies(threadId) {
      return (await said(threadId)).filter((message) => message.author.id === scout.id);
    },
    working,
    async untilWorking(threadId) {
      await eventually(() => working(threadId), (ids) => ids.length > 0, { what: "the agent to take a message up" });
    },
    async untilIdle(threadId) {
      await eventually(() => working(threadId), (ids) => ids.length === 0, { what: "the mark to be cleared" });
    },
    receiptOn: (message, timeoutMs) =>
      eventually(
        () => chat.chat.messages().find((candidate) => candidate.id === message.id)?.receipts.find((r) => r.memberId === scout.id),
        (receipt) => receipt !== undefined,
        { what: `a receipt on "${message.text}"`, timeoutMs },
      ) as Promise<Receipt>,
    async attach(threadId = thread.id) {
      const attached = await attachThread(home, threadId);
      stopAfter(t, () => attached.connection.close().catch(() => undefined));
      return attached;
    },
  };
}
