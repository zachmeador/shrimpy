/**
 * The agent program: one process that owns one home and serves the agent API
 * for it. Other programs reach an agent only through `contracts/agent`; they
 * never import this program's modules, except that the CLI starts an agent and
 * creates a home through this door. It must not know who its clients are, or
 * anything about the chat server and the gateway beyond their contracts.
 */
import type { AgentEndpoint } from "../contracts/agent/index.ts";
import { loadHome } from "./home/index.ts";
import { buildModels, type HostOptions, openHost } from "./host/index.ts";
import { startServer } from "./server.ts";
import { type CloseOptions, stopper } from "./stop.ts";

export {
  type InitOptions,
  type InitResult,
  initHome,
  type ModelChoice,
  modelLabel,
  parseModelChoice,
} from "./home/index.ts";
export type { CloseOptions } from "./stop.ts";

export type AgentOptions = HostOptions;

export interface RunningAgent {
  readonly endpoint: AgentEndpoint;
  /**
   * Stop taking input, let running turns finish for a short while, then close.
   * Unfinished work resumes at the next start.
   */
  close(options?: CloseOptions): Promise<void>;
}

/** An agent started from its home. */
export interface HomeAgent extends RunningAgent {
  readonly name: string;
  /** The home's absolute path. */
  readonly home: string;
}

/** Take ownership of a home and start serving it. The lock comes first. */
export async function startAgent(options: AgentOptions): Promise<RunningAgent> {
  const host = await openHost(options);
  try {
    const server = await startServer(host);
    return { endpoint: server.endpoint, close: stopper(host, server) };
  } catch (error) {
    await host.close();
    throw error;
  }
}

/**
 * Start the agent that lives at `home`. Its name, model and instructions come
 * from the home's files. Reading them takes no lock and changes nothing, so a
 * home that does not load, or a model that cannot be used, fails before the
 * agent claims the home.
 */
export async function startHomeAgent(home: string): Promise<HomeAgent> {
  const loaded = loadHome(home);
  const model = { provider: loaded.model.provider, modelId: loaded.model.id };
  const models = await buildModels({
    modelsFile: loaded.paths.models,
    authFile: loaded.paths.auth,
    model,
  });
  const agent = await startAgent({
    home: loaded.paths.root,
    models,
    model,
    instructions: loaded.instructions,
  });
  return { ...agent, name: loaded.name, home: loaded.paths.root };
}
