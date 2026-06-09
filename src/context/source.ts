/**
 * Context source specs and their resolution.
 *
 * A source is either a string shorthand ("workspace:foo.md" | "agent:context/")
 * for a file or directory, or a command source object (id/command/timeout/etc.)
 * emitting compact per-turn text. `resolveContextSource` applies defaults.
 */

import { channelMatches } from "../util/channel-pattern.js";

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

export type ResolvedContextCommandSource = Required<ContextCommandSourceConfig>;

/**
 * Resolved source spec — defaults applied, ready to be consumed by producers.
 * The string shorthand survives unchanged; command sources are normalized.
 */
export type ResolvedContextSource = string | ResolvedContextCommandSource;

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

export function commandMatchesChannel(
  source: ResolvedContextCommandSource,
  channel: string | undefined,
): boolean {
  if (!channel) return true;
  return source.channels.some((pattern) => channelMatches(pattern, channel));
}
