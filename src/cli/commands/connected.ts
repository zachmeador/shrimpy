import type { AgentConnection } from "../../contracts/agent/index.ts";
import { AgentNotRunningError, attachLocal } from "../../contracts/agent/node.ts";
import { homeNamed } from "../folder/index.ts";

/**
 * Connect to the agent that `agent` names, a name or the path of its home, for
 * the length of `use`, which is also told the home's path.
 */
export async function withConnection<T>(
  agent: string,
  use: (connection: AgentConnection, home: string) => Promise<T>,
): Promise<T> {
  const home = homeNamed(agent);
  let connection: AgentConnection;
  try {
    connection = await attachLocal(home);
  } catch (error) {
    if (error instanceof AgentNotRunningError) {
      throw new Error(`${error.message} Start one with: shrimpy agent serve ${agent}`, { cause: error });
    }
    throw error;
  }
  try {
    return await use(connection, home);
  } finally {
    // The agent may be gone by now, and there is nothing left to release.
    await connection.close().catch(() => undefined);
  }
}
