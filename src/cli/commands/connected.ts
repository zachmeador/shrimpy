import type { AgentConnection } from "../../contracts/agent/index.ts";
import { AgentNotRunningError, attachLocal } from "../../contracts/agent/node.ts";
import { reachAgent, shellActingOn } from "../talk/index.ts";
import type { Target } from "./which-agent.ts";

/**
 * Connect to the agent that owns `home`, or answer undefined if none is running
 * there. A person reaches it by the home's path, as the home's owner, which
 * needs no gateway, and so does an agent's shell for its own agent. Run in the
 * shell of another agent it goes through the gateway as that agent instead, so
 * that the agent it reaches can refuse. The caller closes the connection.
 */
export async function connectIfRunning(home: string): Promise<AgentConnection | undefined> {
  const shell = shellActingOn(home);
  if (shell !== undefined) return reachAgent(shell, home);
  try {
    return await attachLocal(home);
  } catch (error) {
    if (error instanceof AgentNotRunningError) return undefined;
    throw error;
  }
}

/** What to tell someone who needs a running agent that is not there. */
export const noAgentRunning = (home: string, agent: string): string =>
  `No agent is running at ${home}. Start one with: shrimpy agent serve ${agent}`;

/** Connect to the agent `target` is, for the length of `use`. */
export async function withConnection<T>(
  target: Target,
  use: (connection: AgentConnection) => Promise<T>,
): Promise<T> {
  const connection = await connectIfRunning(target.home);
  if (connection === undefined) throw new Error(noAgentRunning(target.home, target.given));
  try {
    return await use(connection);
  } finally {
    // The agent may be gone by now, and there is nothing left to release.
    await connection.close().catch(() => undefined);
  }
}
