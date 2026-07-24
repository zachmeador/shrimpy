import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readJsonFileStrict } from "../util/json-file.js";

export const WORKSPACE_ENV_VAR: string = "SHRIMPY_WORKSPACE";

export type WorkspaceResolutionSource =
  | "environment"
  | "cwd"
  | "pointer"
  | "default";

export interface WorkspaceResolution {
  workspace: string;
  source: WorkspaceResolutionSource;
  sourcePath?: string;
}

export function workspacePointerPath(homeDir: string = homedir()): string {
  return join(homeDir, ".shrimpy-workspace.json");
}

export function defaultWorkspacePath(homeDir: string = homedir()): string {
  return join(homeDir, ".shrimpy");
}

export function workspaceFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string | null {
  const raw = env[WORKSPACE_ENV_VAR];
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
}

export function workspaceFromCwd(cwd: string = process.cwd()): WorkspaceResolution | null {
  let current = resolve(cwd);
  while (true) {
    const workspace = join(current, ".shrimpy");
    const configPath = join(workspace, "config", "shrimpy.json");
    if (existsSync(configPath)) {
      return {
        workspace,
        source: "cwd",
        sourcePath: configPath,
      };
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function resolveWorkspacePath(
  homeDir: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): string {
  return resolveWorkspacePathInfo(homeDir, env, cwd).workspace;
}

export function resolveWorkspacePathInfo(
  homeDir: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): WorkspaceResolution {
  const fromEnv = workspaceFromEnv(env, cwd);
  if (fromEnv) {
    return {
      workspace: fromEnv,
      source: "environment",
      sourcePath: WORKSPACE_ENV_VAR,
    };
  }

  const fromCwd = workspaceFromCwd(cwd);
  if (fromCwd) return fromCwd;

  const pointerPath = workspacePointerPath(homeDir);
  if (existsSync(pointerPath)) {
    const raw = readJsonFileStrict(
      pointerPath,
      (parsed) => parsed as Record<string, unknown>,
    );
    if (typeof raw.workspace === "string" && raw.workspace) {
      return {
        workspace: raw.workspace,
        source: "pointer",
        sourcePath: pointerPath,
      };
    }
  }

  return {
    workspace: defaultWorkspacePath(homeDir),
    source: "default",
  };
}

export function extractGlobalWorkspace(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const arg = argv[0];
  if (arg === "--workspace") {
    const value = argv[1];
    if (value === undefined || value.startsWith("-")) {
      throw new Error("--workspace requires a workspace path");
    }
    env[WORKSPACE_ENV_VAR] = resolve(value);
    return argv.slice(2);
  }
  if (arg?.startsWith("--workspace=")) {
    const value = arg.slice("--workspace=".length);
    if (!value) throw new Error("--workspace requires a workspace path");
    env[WORKSPACE_ENV_VAR] = resolve(value);
    return argv.slice(1);
  }
  return argv;
}
