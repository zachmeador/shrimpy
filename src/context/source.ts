/**
 * Unified context source/block model.
 *
 * Context sources produce context blocks. There are four source types:
 *
 *   - `file`     — single Markdown file at a workspace- or agent-relative path
 *   - `directory` — top-level Markdown discovery under a directory
 *   - `command`  — shell command emitting compact text (per-turn)
 *   - `runtime`  — framework-internal producer (not user-configurable)
 *
 * Each source emits zero or more ContextBlocks. Session-scoped sources
 * (file/directory) flow into the base system prompt; turn-scoped sources
 * (command/runtime) flow into the per-turn <context> envelope.
 *
 * File and directory sources use the string shorthand "workspace:..." or
 * "agent:...". Command sources are objects with id/command/timeout/etc.
 * Runtime sources are registered internally and surfaced for inspection.
 */

import { channelMatches } from "../util/channel-pattern.js";

export type ContextSourceScope = "session" | "turn";

export type ContextSourceConfig =
  | string  // file or directory: "workspace:foo.md" | "agent:context/"
  | ContextCommandSourceConfig;

export interface ContextCommandSourceConfig {
  type: "command";
  id: string;
  command: string;
  channels?: string[];
  timeoutMs?: number;
  maxChars?: number;
  freshForMs?: number;
}

export interface ResolvedContextCommandSource {
  type: "command";
  id: string;
  command: string;
  channels: string[];
  timeoutMs: number;
  maxChars: number;
  freshForMs: number;
}

/**
 * Resolved source spec — defaults applied, ready to be consumed by producers.
 * The string shorthand survives unchanged; command sources are normalized.
 */
export type ResolvedContextSource = string | ResolvedContextCommandSource;

/**
 * One unit of context. Every source emits zero or more of these.
 *
 * For session-scoped blocks: `body` is the full Markdown content; `inspect`
 * is unused. For turn-scoped blocks: `body` is the one-line summary; `inspect`
 * is the CLI command to re-derive the fact.
 */
export interface ContextBlock {
  id: string;
  title?: string;
  kind: ContextBlockKind;
  scope: ContextSourceScope;
  body: string;
  provenance: string;
  freshness?: string;
  inspect?: string;
}

export type ContextBlockKind =
  | "identity"
  | "memory"
  | "capability"
  | "runtime"
  | "activity"
  | "evidence"
  | "instruction"
  | "fact"
  | "command-output";

export const COMMAND_SOURCE_DEFAULTS = {
  channels: ["*"],
  timeoutMs: 5000,
  maxChars: 1200,
  freshForMs: 60_000,
} as const;

export function resolveContextSource(source: ContextSourceConfig): ResolvedContextSource {
  if (typeof source === "string") return source;
  return {
    type: "command",
    id: source.id,
    command: source.command,
    channels: source.channels ?? [...COMMAND_SOURCE_DEFAULTS.channels],
    timeoutMs: source.timeoutMs ?? COMMAND_SOURCE_DEFAULTS.timeoutMs,
    maxChars: source.maxChars ?? COMMAND_SOURCE_DEFAULTS.maxChars,
    freshForMs: source.freshForMs ?? COMMAND_SOURCE_DEFAULTS.freshForMs,
  };
}

export function isCommandSource(
  source: ResolvedContextSource,
): source is ResolvedContextCommandSource {
  return typeof source !== "string" && source.type === "command";
}

export function isFileOrDirectorySource(source: ResolvedContextSource): source is string {
  return typeof source === "string";
}

export function commandMatchesChannel(
  source: ResolvedContextCommandSource,
  channel: string | undefined,
): boolean {
  if (!channel) return true;
  return source.channels.some((pattern) => channelMatches(pattern, channel));
}
