import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { ChatConnection, ChatEndpoint, Member } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import { type Child, startChild, stopAfter, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";

/** The command that runs Shrimpy, which is how a person starts the chat server. */
const shrimpy = fileURLToPath(new URL("../../cli/main.ts", import.meta.url));

type Listening = ChatEndpoint & { event: string };

export interface ChatServer {
  /** Where it listens now. A chat server that comes back on the same data keeps its ID and its socket. */
  readonly endpoint: ChatEndpoint;
  /** Connect over the socket and say who you are. The connection is closed when the test ends. */
  join(member: Member): Promise<ChatConnection>;
  /** Kill the process, like a chat server that went away. What was said stays in its data. */
  outage(): Promise<void>;
  /** Start it again, like a chat server that came back, on the same data unless `dataDir` says otherwise. */
  recover(options?: { dataDir?: string }): Promise<void>;
}

/**
 * The real chat server, started through the command in a process of its own,
 * with a data directory of its own. It listens in the test's runtime directory,
 * and is killed when the test ends if it is still running.
 */
export async function startChatServer(t: TestContext): Promise<ChatServer> {
  useRuntimeDir(t);
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
    async join(member) {
      const connection = await connectLocal(endpoint);
      stopAfter(t, () => connection.close());
      await connection.chat.identify(member);
      return connection;
    },
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
