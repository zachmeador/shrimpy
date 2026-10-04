import { resolve } from "node:path";
import type { AgentConnection } from "../../contracts/agent/index.ts";
import { AgentNotRunningError, attachLocal } from "../../contracts/agent/node.ts";

/** Connect to the agent at `home` for the length of `use`. */
export async function withConnection<T>(home: string, use: (connection: AgentConnection) => Promise<T>): Promise<T> {
  const root = resolve(home);
  let connection: AgentConnection;
  try {
    connection = await attachLocal(root);
  } catch (error) {
    if (error instanceof AgentNotRunningError) {
      throw new Error(`${error.message} Start one with: shrimpy agent serve ${root}`, { cause: error });
    }
    throw error;
  }
  try {
    return await use(connection);
  } finally {
    // The agent may be gone by now, and there is nothing left to release.
    await connection.close().catch(() => undefined);
  }
}
