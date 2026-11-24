import { join, resolve } from "node:path";
import { AGENT_CONFIG } from "./agent-config.ts";
import { AGENT_RUNTIME_DIR } from "./endpoint.ts";
import { membershipFile } from "./membership.ts";

/** Where the files are inside one agent home that the agent and the `shrimpy` command both reach. */
export interface HomePaths {
  readonly root: string;
  /** Every setting of the agent: its name, its model, its pigment and sigil, and what wakes it in each room. */
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
  /** The folder of what only Shrimpy writes, which holds each file below. */
  readonly state: string;
  /** Pi's credential file for this home. */
  readonly auth: string;
  /** Pi's model file for this home: custom providers and their models. */
  readonly models: string;
  /** The agent's token, made before it first joins the network, and its ID in the gateway's roster once it has joined. */
  readonly member: string;
  /**
   * Disposable files: the owner lock, where to find the agent by this home's path, the shrimpy command
   * the agent's shell runs, and what each trigger's check last printed on standard error.
   */
  readonly runtime: string;
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
  /** The model an agent starts with when its agent.json names none: `{"provider": "...", "id": "..."}`. */
  readonly defaultModel: string;
  /** A random ID for the folder, which some providers are told when it signs in. Made the first time one asks. */
  readonly deviceId: string;
}

export function providerPaths(dir: string): ProviderPaths {
  const root = resolve(dir);
  return {
    root,
    auth: join(root, "auth.json"),
    models: join(root, "models.json"),
    defaultModel: join(root, "default-model.json"),
    deviceId: join(root, "device-id"),
  };
}

export function homePaths(home: string): HomePaths {
  const root = resolve(home);
  const state = join(root, "state");
  const pi = join(state, "pi");
  return {
    root,
    config: join(root, AGENT_CONFIG),
    soul: join(root, "SOUL.md"),
    context: join(root, "context"),
    vault: join(root, "vault"),
    skills: join(root, "skills"),
    triggers: join(root, "triggers"),
    breadcrumbs: join(root, "breadcrumbs"),
    state,
    auth: join(pi, "auth.json"),
    models: join(pi, "models.json"),
    member: membershipFile(root),
    runtime: join(root, AGENT_RUNTIME_DIR),
  };
}
