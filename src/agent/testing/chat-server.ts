import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import type { Member } from "../../contracts/chat/index.ts";
import { Roster } from "../../contracts/gateway/index.ts";
import type { GatewayClient } from "../../contracts/gateway/node.ts";
import { linkTestAgent, startTestGateway, type TestAgent, type TestGateway } from "../../contracts/gateway/testing/index.ts";
import { type Child, eventually, startChild, tempDir, useRuntimeDir } from "../../lib/testing/index.ts";

/** The command that runs Shrimpy, which is how a person starts the chat server. */
const shrimpy = fileURLToPath(new URL("../../cli/main.ts", import.meta.url));

export interface ChatServer {
  /** The real gateway it links to, which runs as a process of its own too. */
  readonly gateway: TestGateway;
  /** Where its store is now. */
  readonly dataDir: string;
  /** A client linked to the gateway as you, which holds chat's objects through it. Closed when the test ends. */
  person(): Promise<GatewayClient>;
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
 * The real chat server, started through the command in a process of its own,
 * with a data directory of its own, beside the real gateway it links to. They
 * listen in the test's runtime directory, and are killed when the test ends if
 * they are still running.
 */
export async function startChatServer(t: TestContext): Promise<ChatServer> {
  useRuntimeDir(t);
  const gateway = await startTestGateway(t);
  let dataDir = tempDir(t, "chat-data");
  let running: Child<unknown> | undefined;
  const start = async (): Promise<void> => {
    running = await startChild(t, { file: shrimpy, args: ["chat", "serve", dataDir] });
  };
  await start();

  return {
    gateway,
    get dataDir() {
      return dataDir;
    },
    person: () => gateway.connect(),
    agent: (name) => linkTestAgent(t, name),
    async member(name) {
      const person = await gateway.connect();
      const roster = await person.host.get(Roster, {}, BACKGROUND_CONTEXT);
      try {
        const found = await eventually(
          () => roster.members.value.find((member) => member.name === name),
          (member) => member !== undefined,
          { what: `${name} to join the roster` },
        );
        return { id: found!.id, kind: found!.kind, name: found!.name };
      } finally {
        roster.release();
      }
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
