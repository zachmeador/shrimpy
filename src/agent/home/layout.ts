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
  /** Pi's credential file for this home. */
  readonly auth: string;
  /** Pi's model file for this home: custom providers and their models. */
  readonly models: string;
  /** The agent's token, made before it first joins the network, and its ID in the gateway's roster once it has joined. */
  readonly member: string;
  /** The engine's storage. Only the owner process opens it. */
  readonly database: string;
  /** Disposable files: the owner lock, where to find the agent by this home's path, and the shrimpy command below. */
  readonly runtime: string;
  /** Where the owner puts the `shrimpy` command its agent's shell runs. */
  readonly bin: string;
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
    auth: join(pi, "auth.json"),
    models: join(pi, "models.json"),
    member: membershipFile(root),
    database: join(root, "state", "agent.sqlite"),
    runtime: join(root, AGENT_RUNTIME_DIR),
    bin: join(root, AGENT_RUNTIME_DIR, "bin"),
  };
}
