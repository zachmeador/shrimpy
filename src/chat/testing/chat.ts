import type { TestContext } from "node:test";
import type { GatewayClient } from "../../contracts/gateway/node.ts";
import { linkTestAgent, startTestGateway, type TestAgent, type TestGateway } from "../../contracts/gateway/testing/index.ts";
import { backoff } from "../../lib/retry/index.ts";
import { stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";
import { type RunningChat, startChat } from "../index.ts";

export interface TestChat {
  readonly chat: RunningChat;
  readonly dataDir: string;
  /** The real gateway the chat server links to. */
  readonly gateway: TestGateway;
  /** A client linked to the gateway as you, which holds chat's objects through it. Closed when the test ends. */
  person(): Promise<GatewayClient>;
  /** An agent's program called `name`, on the roster, whose host holds chat's objects as the agent. Stopped when the test ends. */
  agent(name: string): Promise<TestAgent>;
}

/**
 * A chat server in this process, with a data directory and a runtime directory
 * of its own, linked to the real gateway, which runs as a process of its own.
 * Both stop, with what linked to them, when the test ends.
 */
export async function startTestChat(t: TestContext): Promise<TestChat> {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t);
  const dataDir = tempDir(t, "chat-data");
  const chat = await startChat({ dataDir, backoff: backoff({ firstMs: 5, maxMs: 50 }) });
  stopAfter(t, () => chat.close());
  return {
    chat,
    dataDir,
    gateway,
    person: () => gateway.connect(),
    agent: (name) => linkTestAgent(t, name),
  };
}
