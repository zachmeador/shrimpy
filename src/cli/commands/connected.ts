import { AgentNotRunningError, connectHome, noAgentAt } from "../../contracts/agent/node.ts";
import { shellWord } from "../../lib/text/index.ts";
import { type AgentReached, notRunning, reachAgent, shellActingOn } from "../talk/index.ts";
import type { Target } from "./which-agent.ts";

/**
 * Reach the agent `target` names, or answer undefined if it isn't running. A
 * name is reached through the gateway, wherever the agent runs. A home on this
 * machine is reached by its path, on its own socket, which needs no gateway,
 * by a person and by an agent's shell for its own agent. Run in the shell of
 * another agent it goes through the gateway as that agent instead, so that the
 * agent it reaches can refuse. The caller closes it.
 */
export async function connectIfRunning(target: Target): Promise<AgentReached | undefined> {
  const { home } = target;
  if (home === undefined) return reachAgent({ name: target.given });
  if (shellActingOn(home) !== undefined) return reachAgent({ home });
  try {
    const client = await connectHome(home);
    return { agent: client.agent, host: client.host, close: () => client.close() };
  } catch (error) {
    if (error instanceof AgentNotRunningError) return undefined;
    throw error;
  }
}

/** How to start the agent whose home is at `home`, which ends what a command says when none runs there. */
export const startOne = (home: string): string => `Start one with: shrimpy agent serve ${shellWord(home)}`;

/** What to tell someone who needs a running agent that is not there. */
export const noAgentRunning = (target: Target): string =>
  target.home === undefined ? notRunning(target.given) : `${noAgentAt(target.home)}. ${startOne(target.home)}`;

/** Reach the agent `target` is, for the length of `use`. */
export async function withConnection<T>(target: Target, use: (agent: AgentReached) => Promise<T>): Promise<T> {
  const agent = await connectIfRunning(target);
  if (agent === undefined) throw new Error(noAgentRunning(target));
  try {
    return await use(agent);
  } finally {
    // The agent may be gone by now, and there is nothing left to let go of.
    await agent.close().catch(() => undefined);
  }
}
