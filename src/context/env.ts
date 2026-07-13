import { hostname } from "node:os";
import { readAppMetadata } from "../app/metadata.js";
import type { SessionDescriptor } from "../sessions/spec.js";
import { sessionChannel } from "../sessions/spec.js";

export interface BootEnv {
  workspace_path: string;
  shrimpy_version: string;
  hostname: string;
  timezone: string;
  booted_at_iso: string;
}

interface SessionEnv {
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

export function resolveSessionEnv(opts: {
  descriptor: SessionDescriptor;
  modelId: string;
  provider: string;
  cwd: string;
}): SessionEnv {
  return {
    session_type: opts.descriptor.purpose,
    channel: sessionChannel(opts.descriptor) ?? "",
    session_dir: opts.descriptor.storage.kind === "durable"
      ? opts.descriptor.storage.dir
      : "",
    model_id: opts.modelId,
    provider: opts.provider,
    cwd: opts.cwd,
  };
}
