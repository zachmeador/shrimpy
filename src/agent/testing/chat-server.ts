import type { TestContext } from "node:test";
import type { Member } from "../../contracts/chat/index.ts";
import { memberNamed, startTestChat } from "../../contracts/chat/testing/index.ts";
import type { Client } from "../../contracts/gateway/index.ts";
import { linkTestAgent, startTestGateway, type TestAgent, type TestGateway } from "../../contracts/gateway/testing/index.ts";

export interface ChatServer {
  /** The real gateway it links to, which runs as a process of its own too. */
  readonly gateway: TestGateway;
  /** Where its store is now. */
  readonly dataDir: string;
  /** A client linked to the gateway as you, which holds chat's objects through it. Closed when the test ends. */
  person(): Promise<Client>;
  /** A small agent's program called `name`, on the roster, whose host holds chat's objects as the agent. Stopped when the test ends. */
  agent(name: string): Promise<TestAgent>;
  /** The roster's member called `name`, once it has joined. */
  member(name: string): Promise<Member>;
  /** Kill the process, like a chat server that went away. What was said stays in its data. */
  outage(): Promise<void>;
  /** Start it again, like a chat server that came back, on the same data unless `dataDir` says otherwise. */
  recover(options?: { dataDir?: string }): Promise<void>;
}

/**
 * The real chat server and the real gateway it links to, as the contracts' test
 * support starts them, each in a process of its own, with what an agent's test
 * asks of them at hand. They are killed when the test ends if they are still
 * running.
 */
export async function startChatServer(t: TestContext): Promise<ChatServer> {
  const gateway = await startTestGateway(t);
  const chat = await startTestChat(t);
  return {
    gateway,
    get dataDir() {
      return chat.dataDir;
    },
    person: () => gateway.connect(),
    agent: (name) => linkTestAgent(t, name),
    member: (name) => memberNamed(t, name),
    outage: () => chat.outage(),
    recover: (options) => chat.recover(options),
  };
}
