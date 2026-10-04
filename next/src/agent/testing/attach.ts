import type { TestContext } from "node:test";
import type { AgentConnection, SessionHandle } from "../../contracts/agent/index.ts";
import { attachLocal } from "../../contracts/agent/node.ts";
import { stopAfter } from "../../lib/testing/index.ts";

/** Stop `agent` when the test ends, whether or not the test passed. Stopping twice is fine. */
export function closeAfter<T extends { close(options?: { now?: boolean }): Promise<void> }>(
  t: TestContext,
  agent: T,
): T {
  stopAfter(t, () => agent.close({ now: true }));
  return agent;
}

/** Connect to the agent that owns `home` and attach to the session behind a thread. */
export async function attachThread(
  home: string,
  threadId: string,
): Promise<{ connection: AgentConnection; session: SessionHandle }> {
  const connection = await attachLocal(home);
  try {
    return { connection, session: await connection.attach(threadId) };
  } catch (error) {
    await connection.close();
    throw error;
  }
}
