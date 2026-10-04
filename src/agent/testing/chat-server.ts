import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { ChatEndpoint, Member } from "../../contracts/chat/index.ts";
import { type Entered, enterAsAgent, enterAsPerson, memberNamed } from "../../contracts/chat/testing/index.ts";
import { startTestGateway, type TestGateway } from "../../contracts/gateway/testing/index.ts";
import { type Child, startChild, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";

/** The command that runs Shrimpy, which is how a person starts the chat server. */
const shrimpy = fileURLToPath(new URL("../../cli/main.ts", import.meta.url));

type Listening = ChatEndpoint & { event: string };

export interface ChatServer {
  /** Where it listens now. A chat server that comes back on the same data keeps its ID and its socket. */
  readonly endpoint: ChatEndpoint;
  /** The real gateway it is registered with, which runs as a process of its own too. */
  readonly gateway: TestGateway;
  /** Where its store is now. */
  readonly dataDir: string;
  /** Come in as the person who runs the gateway. The connection is closed when the test ends. */
  person(): Promise<Entered>;
  /** Come in as the agent called `name`, which joins the roster the first time. The connection is closed when the test ends. */
  agent(name: string): Promise<Entered>;
  /** The roster's member called `name`, once it has joined. */
  member(name: string): Promise<Member>;
  /** Kill the process, like a chat server that went away. What was said stays in its data. */
  outage(): Promise<void>;
  /** Start it again, like a chat server that came back, on the same data unless `dataDir` says otherwise. */
  recover(options?: { dataDir?: string }): Promise<void>;
}

/**
 * The real chat server, started through the command in a process of its own,
 * with a data directory of its own, beside the real gateway it registers with.
 * They listen in the test's runtime directory, and are killed when the test ends
 * if they are still running.
 */
export async function startChatServer(t: TestContext): Promise<ChatServer> {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t);
  let dataDir = tempDir(t, "chat-data");
  let running: Child<Listening> | undefined;
  let endpoint: ChatEndpoint;
  const start = async (): Promise<void> => {
    running = await startChild<Listening>(t, { file: shrimpy, args: ["chat", "serve", dataDir] });
    endpoint = { serverId: running.line.serverId, socket: running.line.socket, pid: running.line.pid };
  };
  await start();

  return {
    get endpoint() {
      return endpoint;
    },
    gateway,
    get dataDir() {
      return dataDir;
    },
    person: () => enterAsPerson(t, endpoint),
    agent: (name) => enterAsAgent(t, endpoint, name),
    member: (name) => memberNamed(t, name),
    async outage() {
      const stopped = running;
      running = undefined;
      await stopped?.kill("SIGKILL");
    },
    async recover(options = {}) {
      if (running !== undefined) throw new Error("The chat server is running.");
      dataDir = options.dataDir ?? dataDir;
      await start();
    },
  };
}
