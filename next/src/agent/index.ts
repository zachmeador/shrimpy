/**
 * The agent program: one process that owns one home and serves the agent API
 * for it. Other programs reach an agent only through `contracts/agent`; they
 * never import this program's modules.
 */
import type { AgentEndpoint } from "../contracts/agent/index.ts";
import { type HostOptions, openHost } from "./host/index.ts";
import { startServer } from "./server.ts";

export type AgentOptions = HostOptions;

export interface RunningAgent {
  readonly endpoint: AgentEndpoint;
  close(): Promise<void>;
}

/** Take ownership of a home and start serving it. The lock comes first. */
export async function startAgent(options: AgentOptions): Promise<RunningAgent> {
  const host = await openHost(options);
  try {
    const server = await startServer(host);
    return {
      endpoint: server.endpoint,
      async close() {
        await server.close();
        await host.close();
      },
    };
  } catch (error) {
    await host.close();
    throw error;
  }
}
