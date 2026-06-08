import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readJsonFileStrict } from "../util/json-file.js";

export function workspacePointerPath(homeDir: string = homedir()): string {
  return join(defaultWorkspacePath(homeDir), ".shrimpy-workspace.json");
}

export function homeWorkspacePointerPath(homeDir: string = homedir()): string {
  return join(homeDir, ".shrimpy-workspace.json");
}

export function defaultWorkspacePath(homeDir: string = homedir()): string {
  return join(homeDir, ".shrimpy");
}

export function workspacePointerPaths(homeDir: string = homedir()): string[] {
  return [
    workspacePointerPath(homeDir),
    homeWorkspacePointerPath(homeDir),
  ];
}

export function resolveWorkspacePath(homeDir: string = homedir()): string {
  for (const pointerPath of workspacePointerPaths(homeDir)) {
    if (!existsSync(pointerPath)) continue;
    const raw = readJsonFileStrict(
      pointerPath,
      (parsed) => parsed as Record<string, unknown>,
    );
    if (typeof raw.workspace === "string" && raw.workspace) return raw.workspace;
  }

  return defaultWorkspacePath(homeDir);
}
