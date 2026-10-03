import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { ChatConnection, ChatEndpoint, Member } from "../../contracts/chat/index.ts";
import { connectLocal } from "../../contracts/chat/node.ts";
import { startChild, stopAfter } from "../../lib/testing/index.ts";

const childScript = fileURLToPath(new URL("./chat-child.ts", import.meta.url));

export interface ChatChild {
  readonly endpoint: ChatEndpoint;
  /** Stop the process with `signal`, and wait until it has gone. */
  kill(signal: NodeJS.Signals): Promise<void>;
}

/**
 * Start a whole chat server in its own process, and wait until it is
 * listening. It puts its socket in the test's runtime directory, so the test
 * has to have one. It is killed when the test ends if it is still running.
 */
export async function startChatChild(t: TestContext, options: { dataDir: string }): Promise<ChatChild> {
  const child = await startChild<ChatEndpoint & { event: string }>(t, {
    file: childScript,
    args: [options.dataDir],
  });
  const { event: _event, ...endpoint } = child.line;
  return { endpoint, kill: child.kill };
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
