import { hostname } from "node:os";
import { readAppMetadata } from "../app/metadata.js";
import type { SessionDescriptor } from "../sessions/spec.js";

export interface BootEnv {
  workspace_path: string;
  shrimpy_version: string;
  hostname: string;
  timezone: string;
  booted_at_iso: string;
}

export interface SessionEnv {
  session_type: string;
  channel: string;
  session_dir: string;
  model_id: string;
  provider: string;
  cwd: string;
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

export function resolveBootEnv(workspacePath: string): BootEnv {
  return {
    workspace_path: workspacePath,
    shrimpy_version: readAppMetadata().version,
    hostname: hostname(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    booted_at_iso: new Date().toISOString(),
  };
}

export function resolveSessionEnv(opts: {
  descriptor: SessionDescriptor;
  modelId: string;
  provider: string;
  cwd: string;
}): SessionEnv {
  return {
    session_type: opts.descriptor.kind,
    channel: opts.descriptor.channel ?? "",
    session_dir: opts.descriptor.sessionDir,
    model_id: opts.modelId,
    provider: opts.provider,
    cwd: opts.cwd,
  };
}
