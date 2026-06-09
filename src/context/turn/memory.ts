/**
 * Memory context — the per-turn slice of agent context.
 *
 * Path-indexed: for the active turn, load agents/<id>/context/people/<sender>.md
 * and agents/<id>/context/channels/<channel>.md if they exist. No section
 * parsing — the path is the routing index. Missing files emit nothing.
 *
 * Session-scoped agent context (everything else under context/) is loaded
 * by the normal resource assembly path, not here.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppRuntime } from "../../app/runtime.js";

interface MemoryContextInput {
  runtime: AppRuntime;
  agentId: string;
  channel?: string;
  peerIds?: string[];
}

interface MemoryTurnContextItem {
  source: "people" | "channel";
  key: string;
  path: string;
  body: string;
}

export interface MemoryContext {
  agentId: string;
  channel?: string;
  items: MemoryTurnContextItem[];
}

export function buildMemoryContext(input: MemoryContextInput): MemoryContext {
  const { runtime, agentId, channel, peerIds = [] } = input;
  const agentRoot = safeAgentRoot(runtime, agentId);
  const items: MemoryTurnContextItem[] = [];

  if (agentRoot) {
    for (const peerId of peerIds) {
      const path = join(agentRoot, "context", "people", `${sanitize(peerId)}.md`);
      const body = readIfExists(path);
      if (body) items.push({ source: "people", key: `peer:${peerId}`, path, body });
    }

    if (channel) {
      const path = join(agentRoot, "context", "channels", `${sanitize(channel)}.md`);
      const body = readIfExists(path);
      if (body) items.push({ source: "channel", key: `channel:${channel}`, path, body });
    }
  }

  return { agentId, channel, items };
}

function safeAgentRoot(runtime: AppRuntime, agentId: string): string | undefined {
  try {
    return runtime.getAgentPaths(agentId).root;
  } catch {
    return undefined;
  }
}

function readIfExists(path: string): string | undefined {
  if (!existsSync(path)) return undefined;
  const body = readFileSync(path, "utf-8").trim();
  return body || undefined;
}

/**
 * Safe filename derivation. Peers and channels can contain ":" and other
 * characters that need normalization to a single-segment filename.
 */
function sanitize(id: string): string {
  return id.replaceAll(/[^A-Za-z0-9_.-]+/g, "-");
}

export function renderMemoryContext(context: MemoryContext): string {
  if (context.items.length === 0) return "";

  const blocks: string[] = [];
  for (const item of context.items) {
    blocks.push([`### ${item.key}`, `*${item.source}* — ${item.path}`, item.body].join("\n"));
  }
  return ["## Memory Context", "", ...blocks].join("\n\n");
}
