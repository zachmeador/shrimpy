import { join, resolve } from "node:path";
import { AGENT_RUNTIME_DIR, membershipFile } from "../../contracts/agent/index.ts";

/** Where everything lives inside one agent home. */
export interface HomePaths {
  readonly root: string;
  /** The agent's name and default model. */
  readonly config: string;
  /** The agent's own instructions. */
  readonly soul: string;
  readonly context: string;
  readonly vault: string;
  readonly skills: string;
  /** One small Markdown file for each standing trigger. */
  readonly triggers: string;
  /** One small Markdown file for each fact that moves, which a session is shown once, when the fact is new to it. */
  readonly breadcrumbs: string;
  /** What wakes the agent in each room it has chosen for. It is not there until something is chosen. */
  readonly wake: string;
  /** Pi's credential file for this home. */
  readonly auth: string;
  /** Pi's model file for this home: custom providers and their models. */
  readonly models: string;
  /** The agent's token, made before it first joins the network, and its ID in the gateway's roster once it has joined. */
  readonly member: string;
  /** The engine's storage. Only the owner process opens it. */
  readonly database: string;
  /**
   * Disposable files: the owner lock, where to find the agent by this home's path, the shrimpy command below, and
   * what each trigger's check last printed on standard error.
   */
  readonly runtime: string;
  /** Where the owner puts the `shrimpy` command its agent's shell runs. */
  readonly bin: string;
}

/**
 * Where the files are in the `providers/` directory of the folder agents are
 * started in. They have the formats of a home's own files, and an agent takes
 * from them what its home doesn't hold.
 */
export interface ProviderPaths {
  readonly root: string;
  /** Sign-ins and keys, in the format of a home's auth.json. */
  readonly auth: string;
  /** Model servers of your own, in the format of a home's models.json. */
  readonly models: string;
}

export function providerPaths(dir: string): ProviderPaths {
  const root = resolve(dir);
  return { root, auth: join(root, "auth.json"), models: join(root, "models.json") };
}

export function homePaths(home: string): HomePaths {
  const root = resolve(home);
  const pi = join(root, "state", "pi");
  return {
    root,
    config: join(root, "agent.json"),
    soul: join(root, "SOUL.md"),
    context: join(root, "context"),
    vault: join(root, "vault"),
    skills: join(root, "skills"),
    triggers: join(root, "triggers"),
    breadcrumbs: join(root, "breadcrumbs"),
    wake: join(root, "wake.json"),
    auth: join(pi, "auth.json"),
    models: join(pi, "models.json"),
    member: membershipFile(root),
    database: join(root, "state", "agent.sqlite"),
    runtime: join(root, AGENT_RUNTIME_DIR),
    bin: join(root, AGENT_RUNTIME_DIR, "bin"),
  };
}
