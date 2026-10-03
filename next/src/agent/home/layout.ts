import { join, resolve } from "node:path";

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
  /** Pi's credential file for this home. */
  readonly auth: string;
  /** Pi's model file for this home: custom providers and their models. */
  readonly models: string;
  /** The engine's storage. Only the owner process opens it. */
  readonly database: string;
  /** Disposable files: the owner lock, the endpoint, sockets and logs. */
  readonly runtime: string;
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
    auth: join(pi, "auth.json"),
    models: join(pi, "models.json"),
    database: join(root, "state", "agent.sqlite"),
    runtime: join(root, "runtime"),
  };
}
