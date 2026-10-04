/**
 * The agent program: one process that owns one home, serves the agent API for
 * it, and takes part in chat. Other programs reach an agent only through
 * `contracts/agent`; they never import this program's modules, except that the
 * CLI starts an agent, creates a home and previews what a home would tell an
 * agent through this door. It must not know who its clients are, or anything
 * about the chat server and the gateway beyond their contracts.
 */
import type { AgentEndpoint } from "../contracts/agent/index.ts";
import { socketPathFor } from "../lib/runtime/node.ts";
import { type ContextPreview, homeContext, previewContext } from "./extensions/index.ts";
import { loadHome } from "./home/index.ts";
import { buildModels, type HostOptions, openHost } from "./host/index.ts";
import { join, type JoinOptions } from "./join.ts";
import { startServer } from "./server.ts";
import { createSessions, type SessionDefaults } from "./sessions/index.ts";
import { type CloseOptions, stopper } from "./stop.ts";

export type { ContextPreview } from "./extensions/index.ts";
export {
  type InitOptions,
  type InitResult,
  initHome,
  type LeftOut,
  type ModelChoice,
  modelLabel,
  parseModelChoice,
} from "./home/index.ts";
export type { JoinOptions } from "./join.ts";
export type { CloseOptions } from "./stop.ts";

export interface AgentOptions extends HostOptions {
  /** The agent's name: who it is in chat, what the gateway lists it as, and what its instructions call it. */
  name: string;
  /** The model every session uses. It is set again at every start. */
  model: SessionDefaults["model"];
  /** Take part in chat. Without it, nothing reaches the agent but clients that attach to its sessions. */
  join?: JoinOptions;
}

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

/**
 * Take ownership of a home and start serving it. The lock comes first. What the
 * home's files tell the agent is read before that, and read again only when
 * the agent is told to reload.
 */
export async function startAgent(options: AgentOptions): Promise<RunningAgent> {
  // A runtime directory too long for a socket fails here, before the home is claimed.
  socketPathFor(options.home);
  const context = await homeContext({ name: options.name, home: options.home });
  const host = await openHost(options, [context.extension]);
  try {
    const report = reporter(options);
    for (const { file, reason } of context.report.leftOut) report(new Error(`${file} was left out: ${reason}.`));
    const sessions = createSessions(host.harness, { model: options.model, cwd: host.home });
    // Sessions from an earlier start follow the home as it is now, before any of their work resumes.
    await sessions.applyDefaults();
    host.resume();
    const server = await startServer(host, sessions);
    try {
      const joined =
        options.join === undefined
          ? undefined
          : join(options.name, options.join, server.endpoint, sessions.turns, report);
      return { endpoint: server.endpoint, close: stopper({ host, server, joined }) };
    } catch (error) {
      await server.close();
      throw error;
    }
  } catch (error) {
    await host.close();
    throw error;
  }
}

/** Where problems with the gateway and chat go: they are told once each and the agent carries on. */
function reporter(options: AgentOptions): (error: Error) => void {
  return (error) => {
    if (options.onReport === undefined) console.error("[agent]", error.message);
    else options.onReport(error);
  };
}

/**
 * Start the agent that lives at `home`, and have it take part in chat as the
 * agent its `agent.json` names. Its name and model come from that file, and
 * its instructions from the files of the home. Reading `agent.json` takes no
 * lock and changes nothing, so a home that does not load, or a model that
 * cannot be used, fails before the agent claims the home.
 */
export async function startHomeAgent(home: string): Promise<HomeAgent> {
  const loaded = loadHome(home);
  const model = { provider: loaded.model.provider, modelId: loaded.model.id };
  const models = await buildModels({
    modelsFile: loaded.paths.models,
    authFile: loaded.paths.auth,
    model,
  });
  const agent = await startAgent({ home: loaded.paths.root, name: loaded.name, models, model, join: {} });
  return { ...agent, name: loaded.name, home: loaded.paths.root };
}

/**
 * What the agent whose home is `home` would be told if it started now, read
 * from the home's files without starting anything and without a lock. An agent
 * that is running has what it read when it started or last reloaded.
 */
export async function previewHomeContext(home: string): Promise<ContextPreview> {
  const loaded = loadHome(home);
  return previewContext({ name: loaded.name, home: loaded.paths.root });
}
