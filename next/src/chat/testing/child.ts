import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { ChatConnection, ChatEndpoint, Member } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import { stopAfter } from "./cleanup.ts";

const childScript = fileURLToPath(new URL("./chat-child.ts", import.meta.url));

export interface ChatChild {
  readonly endpoint: ChatEndpoint;
  /** Stop the process with `signal`, and wait until it has gone. */
  kill(signal: NodeJS.Signals): Promise<void>;
}

/**
 * Start a whole chat server in its own process, and wait until it is
 * listening. It is killed when the test ends if it is still running.
 */
export async function startChatChild(
  t: TestContext,
  options: { dataDir: string; runtimeDir: string },
): Promise<ChatChild> {
  const child = spawn(process.execPath, [childScript, options.dataDir], {
    env: { ...process.env, SHRIMPY_RUNTIME_DIR: options.runtimeDir },
    stdio: ["ignore", "pipe", "inherit"],
  });
  const kill = async (signal: NodeJS.Signals): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill(signal);
    await once(child, "exit");
  };
  stopAfter(t, () => kill("SIGKILL"));
  return { endpoint: await listening(child), kill };
}

function listening(child: ChildProcess): Promise<ChatEndpoint> {
  return new Promise((resolve, reject) => {
    let output = "";
    const exited = (code: number | null, signal: NodeJS.Signals | null): void => {
      reject(new Error(`The chat server exited (${code ?? signal}) before it was listening`));
    };
    child.once("exit", exited);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      const line = output.split("\n")[0];
      if (line === undefined || !output.includes("\n")) return;
      child.off("exit", exited);
      const { event: _event, ...endpoint } = JSON.parse(line) as ChatEndpoint & { event: string };
      resolve(endpoint);
    });
  });
}

/** Connect to the chat server at `endpoint` as `member`. The connection is closed when the test ends. */
export async function joinEndpoint(
  t: TestContext,
  endpoint: ChatEndpoint,
  member: Member,
): Promise<ChatConnection> {
  const connection = await connectLocal(endpoint);
  stopAfter(t, () => connection.close());
  await connection.chat.identify(member);
  return connection;
}
