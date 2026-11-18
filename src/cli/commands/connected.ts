import { AgentNotRunningError, connectHome, noAgentAt } from "../../contracts/agent/node.ts";
import { type AgentReached, reachAgent, shellActingOn } from "../talk/index.ts";
import type { Target } from "./which-agent.ts";

/**
 * Reach the agent that owns `home`, or answer undefined if none is running
 * there. A person reaches it by the home's path, on its own socket, which needs
 * no gateway, and so does an agent's shell for its own agent. Run in the shell
 * of another agent it goes through the gateway as that agent instead, so that
 * the agent it reaches can refuse. The caller closes it.
 */
export async function connectIfRunning(home: string): Promise<AgentReached | undefined> {
  const shell = shellActingOn(home);
  if (shell !== undefined) return reachAgent(shell, home);
  try {
    const client = await connectHome(home);
    return { name: client.name, host: client.host, close: () => client.close() };
  } catch (error) {
    if (error instanceof AgentNotRunningError) return undefined;
    throw error;
  }
}

/** How to start the agent `target` names, which ends what a command says when none runs there. */
export const startOne = (target: Target): string => `Start one with: shrimpy agent serve ${target.given}`;

/** What to tell someone who needs a running agent that is not there. */
export const noAgentRunning = (target: Target): string => `${noAgentAt(target.home)}. ${startOne(target)}`;

/** Reach the agent `target` is, for the length of `use`. */
export async function withConnection<T>(target: Target, use: (agent: AgentReached) => Promise<T>): Promise<T> {
  const agent = await connectIfRunning(target.home);
  if (agent === undefined) throw new Error(noAgentRunning(target));
  try {
    return await use(agent);
  } finally {
    // The agent may be gone by now, and there is nothing left to let go of.
    await agent.close().catch(() => undefined);
  }
}
