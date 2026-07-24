import { hostname } from "node:os";
import { readAppMetadata } from "../app/metadata.js";

export interface BootEnv {
  workspace_path: string;
  shrimpy_version: string;
  hostname: string;
  timezone: string;
  booted_at_iso: string;
}

export const KNOWN_RUNTIME_ENV_KEYS = new Set([
  "workspace_path",
  "shrimpy_version",
  "hostname",
  "timezone",
  "booted_at_iso",
  "session_type",
  "channel",
  "session_dir",
  "model_id",
  "provider",
  "cwd",
]);

const SESSION_METADATA_ONLY_ENV_KEYS = new Set([
  "model_id",
  "provider",
]);

export function isPromptRuntimeEnvKey(key: string): boolean {
  return !SESSION_METADATA_ONLY_ENV_KEYS.has(key);
}

export function resolveBootEnv(workspacePath: string): BootEnv {
  return {
    workspace_path: workspacePath,
    shrimpy_version: readAppMetadata().version,
    hostname: hostname(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    booted_at_iso: new Date().toISOString(),
  };
}
