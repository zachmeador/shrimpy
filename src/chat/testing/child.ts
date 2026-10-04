import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import type { ChatEndpoint } from "../../contracts/chat/index.ts";
import { startChild } from "../../lib/testing/index.ts";

const childScript = fileURLToPath(new URL("./chat-child.ts", import.meta.url));

export interface ChatChild {
  readonly endpoint: ChatEndpoint;
  /** Stop the process with `signal`, and wait until it has gone. */
  kill(signal: NodeJS.Signals): Promise<void>;
}

/**
 * Start a whole chat server in its own process, and wait until it is
 * listening. It puts its socket in the test's runtime directory, so the test
 * has to have one, and it registers with the gateway there if one runs. It is
 * killed when the test ends if it is still running.
 */
export async function startChatChild(t: TestContext, options: { dataDir: string }): Promise<ChatChild> {
  const child = await startChild<ChatEndpoint & { event: string }>(t, {
    file: childScript,
    args: [options.dataDir],
  });
  const { event: _event, ...endpoint } = child.line;
  return { endpoint, kill: child.kill };
}
