import { existsSync } from "node:fs";
import { join } from "node:path";

export function configDir(workspace: string): string {
  return join(workspace, "config");
}

export function primaryConfigPath(workspace: string): string {
  return join(configDir(workspace), "shrimpy.json");
}

export function hasPrimaryConfig(workspace: string): boolean {
  return existsSync(primaryConfigPath(workspace));
}
