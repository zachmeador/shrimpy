import { statSync } from "node:fs";
import { resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import { stripTurnContextPrefixForDisplay } from "../context/turn/prompt-prefix.js";
import {
  flattenGatewayLanes,
  gatewayRuntimeStatePath,
  loadGatewayRuntimeState,
  type GatewayLaneState,
} from "../gateway/runtime-state.js";
import { formatAgeShort } from "../util/time-format.js";
import {
  DEFAULT_SESSION_PROFILE_ID,
  formatSessionId,
  parseSessionId,
  sameSessionKey,
  type SessionKey,
} from "./identity.js";
import { listSessionDescriptors } from "./manifest.js";
import { readSessionOwner, type SessionOwner } from "./ownership.js";
import {
  summarizeActiveSessionPath,
  summarizeSessionPath,
  type SessionPathSummary,
} from "./path-summary.js";
import { createSessionDescriptor, type SessionDescriptor } from "./spec.js";
import {
  findActiveSessionFile,
  findMostRecentSessionFile,
  listArchivedSessionFiles,
} from "./transcript-store.js";

export interface SessionSummary {
  sessionId: string;
  purpose: string;
  delivery: SessionDescriptor["delivery"];
  active: SessionPathSummary;
  archives: SessionPathSummary[];
  owner?: SessionOwner;
  gatewayLanes: GatewayLaneState[];
}

export interface SessionListingSummary {
  agentId: string;
  sessionsRoot: string;
  sessions: SessionSummary[];
}

export interface NavigableSessionSummary {
  agentId: string;
  sessionId: string;
  purpose: string;
  path: string;
  sessionDir: string;
  name?: string;
  preview?: string;
  updatedAt: string;
  updatedAtMs: number;
  current: boolean;
}

export interface NavigableAgentSummary {
  agentId: string;
  current: boolean;
  sessions: NavigableSessionSummary[];
}

export interface NavigableSessionInventory {
  agents: NavigableAgentSummary[];
  sessionCount: number;
}

interface SessionStatusEntry {
  sessionId: string;
  name: string;
  path: string;
  updatedAt: string;
  updatedAtMs: number;
  ageMs: number;
  status: "recent" | "stale";
}

export interface SessionStatusSummary {
  agentId: string;
  sessionsRoot: string;
  staleAfterMs: number;
  counts: { active: number; recent: number; stale: number };
  active: SessionStatusEntry[];
  mostRecent?: SessionStatusEntry;
}

export function resolveMostRecentInteractiveAgentId(
  runtime: AppRuntime,
): string | undefined {
  let mostRecent: { agentId: string; updatedAtMs: number } | undefined;

  for (const agent of runtime.resolved.agents) {
    const descriptor = listSessionDescriptors(runtime.getAgentPaths(agent.id).root)
      .find((candidate) =>
        candidate.key.namespace === "local" &&
        candidate.key.name === "main" &&
        candidate.key.profileId === DEFAULT_SESSION_PROFILE_ID &&
        candidate.purpose === "interactive" &&
        candidate.delivery.kind === "transcript"
      );
    if (!descriptor || descriptor.storage.kind !== "durable") continue;

    const recentPath = findMostRecentSessionFile(descriptor.storage.dir);
    if (!recentPath) continue;

    let updatedAtMs: number;
    try {
      updatedAtMs = statSync(recentPath).mtimeMs;
    } catch {
      continue;
    }
    if (!mostRecent || updatedAtMs > mostRecent.updatedAtMs) {
      mostRecent = { agentId: agent.id, updatedAtMs };
    }
  }

  return mostRecent?.agentId;
}

export function summarizeAgentSessions(
  runtime: AppRuntime,
  opts?: { agentId?: string; sessionId?: string },
): SessionListingSummary | SessionSummary {
  const agent = runtime.getAgent(opts?.agentId);
  const descriptors = listSessionDescriptors(runtime.getAgentPaths(agent.id).root);
  if (opts?.sessionId) {
    return summarizeDescriptor(runtime, resolveSessionDescriptor(runtime, agent.id, opts.sessionId));
  }
  return {
    agentId: agent.id,
    sessionsRoot: `${runtime.getAgentPaths(agent.id).root}/sessions`,
    sessions: descriptors
      .map((descriptor) => summarizeDescriptor(runtime, descriptor))
      .sort((a, b) => a.sessionId.localeCompare(b.sessionId)),
  };
}

export function summarizeNavigableSessions(
  runtime: AppRuntime,
  opts?: { currentSessionFile?: string; currentAgentId?: string },
): NavigableSessionInventory {
  const currentPath = opts?.currentSessionFile
    ? resolve(opts.currentSessionFile)
    : undefined;
  const agents = runtime.resolved.agents.map((agent) => {
    const sessions = listSessionDescriptors(runtime.getAgentPaths(agent.id).root)
      .filter(isNavigableDescriptor)
      .flatMap((descriptor) => {
        if (descriptor.storage.kind !== "durable") return [];
        const active = findActiveSessionFile(descriptor.storage.dir);
        if (!active) return [];
        const summary = summarizeNavigableSession(
          agent.id,
          descriptor,
          active,
          currentPath,
        );
        return summary ? [summary] : [];
      })
      .sort((left, right) => {
        if (left.current !== right.current) return left.current ? -1 : 1;
        return right.updatedAtMs - left.updatedAtMs
          || left.sessionId.localeCompare(right.sessionId);
      });
    return {
      agentId: agent.id,
      current: agent.id === opts?.currentAgentId
        || sessions.some((session) => session.current),
      sessions,
    };
  });
  return {
    agents,
    sessionCount: agents.reduce((count, agent) => count + agent.sessions.length, 0),
  };
}

export function resolveSessionDescriptor(
  runtime: AppRuntime,
  agentId: string | undefined,
  sessionId: string,
): SessionDescriptor {
  const agent = runtime.getAgent(agentId);
  const agentRoot = runtime.getAgentPaths(agent.id).root;
  const key = parseSessionId(agent.id, sessionId);
  return listSessionDescriptors(agentRoot).find((item) => sameSessionKey(item.key, key)) ??
    descriptorFor(agentRoot, key);
}

export function summarizeSessionStatus(
  runtime: AppRuntime,
  opts?: { agentId?: string; staleAfterMs?: number },
): SessionStatusSummary {
  const agent = runtime.getAgent(opts?.agentId);
  const staleAfterMs = opts?.staleAfterMs ?? 12 * 60 * 60 * 1000;
  const listing = summarizeAgentSessions(runtime, { agentId: agent.id });
  if ("sessionId" in listing) throw new Error("session status requires an agent listing");
  const now = Date.now();
  const active = listing.sessions
    .flatMap((session) => {
      const entry = statusEntry(session.sessionId, session.active, now, staleAfterMs);
      return entry ? [entry] : [];
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  const stale = active.filter((session) => session.status === "stale").length;
  return {
    agentId: listing.agentId,
    sessionsRoot: listing.sessionsRoot,
    staleAfterMs,
    counts: { active: active.length, recent: active.length - stale, stale },
    active,
    mostRecent: active[0],
  };
}

export function formatSessionAge(ms: number): string {
  return formatAgeShort(ms);
}

function descriptorFor(agentRoot: string, key: SessionKey): SessionDescriptor {
  const purpose = key.namespace === "channel"
    ? "channel"
    : key.namespace === "worker"
      ? "worker"
      : key.name === "setup" ? "setup" : "interactive";
  return createSessionDescriptor({
    agentRoot,
    key,
    purpose,
    delivery: key.namespace === "channel"
      ? { kind: "channel", channel: key.name }
      : { kind: "transcript" },
  });
}

function summarizeDescriptor(runtime: AppRuntime, descriptor: SessionDescriptor): SessionSummary {
  if (descriptor.storage.kind !== "durable") throw new Error("cannot summarize an in-memory session");
  const channel = descriptor.delivery.kind === "channel" ? descriptor.delivery.channel : undefined;
  return {
    sessionId: formatSessionId(descriptor.key),
    purpose: descriptor.purpose,
    delivery: descriptor.delivery,
    active: summarizeActiveSessionPath(descriptor.storage.dir),
    archives: listArchivedSessionFiles(descriptor.storage.dir).map(summarizeSessionPath),
    owner: readSessionOwner(runtime.paths.workspace, descriptor.key),
    gatewayLanes: channel ? gatewayLanesFor(runtime, descriptor.key.agentId, channel) : [],
  };
}

function isNavigableDescriptor(descriptor: SessionDescriptor): boolean {
  return descriptor.key.namespace === "local"
    && descriptor.purpose === "interactive"
    && descriptor.delivery.kind === "transcript"
    && descriptor.storage.kind === "durable";
}

function summarizeNavigableSession(
  agentId: string,
  descriptor: SessionDescriptor,
  path: string,
  currentPath: string | undefined,
): NavigableSessionSummary | undefined {
  let updatedAtMs: number;
  try {
    updatedAtMs = statSync(path).mtimeMs;
  } catch {
    return undefined;
  }

  const metadata = readNavigableSessionMetadata(path);
  return {
    agentId,
    sessionId: formatSessionId(descriptor.key),
    purpose: descriptor.purpose,
    path,
    sessionDir: descriptor.storage.kind === "durable"
      ? descriptor.storage.dir
      : "",
    ...(metadata.name ? { name: metadata.name } : {}),
    ...(metadata.preview ? { preview: metadata.preview } : {}),
    updatedAt: new Date(updatedAtMs).toISOString(),
    updatedAtMs,
    current: currentPath === resolve(path),
  };
}

function readNavigableSessionMetadata(path: string): {
  name?: string;
  preview?: string;
} {
  try {
    const session = SessionManager.open(path);
    const name = session.getSessionName();
    const preview = firstUserText(session.getEntries());
    return {
      ...(name ? { name } : {}),
      ...(preview ? { preview } : {}),
    };
  } catch {
    return {};
  }
}

function firstUserText(entries: readonly unknown[]): string | undefined {
  for (const entry of entries) {
    const candidate = entry as {
      type?: string;
      message?: { role?: string; content?: unknown };
    };
    if (candidate.type !== "message" || candidate.message?.role !== "user") continue;
    const text = stripTurnContextPrefixForDisplay(
      messageText(candidate.message.content),
    )
      .replace(/\s+/gu, " ")
      .trim();
    if (text) return text.length > 96 ? `${text.slice(0, 93)}...` : text;
  }
  return undefined;
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block): block is { type: "text"; text: string } =>
      typeof block === "object"
      && block !== null
      && "type" in block
      && block.type === "text"
      && "text" in block
      && typeof block.text === "string"
    )
    .map((block) => block.text)
    .join(" ");
}

function gatewayLanesFor(runtime: AppRuntime, agentId: string, channel: string) {
  return flattenGatewayLanes(
    loadGatewayRuntimeState(gatewayRuntimeStatePath(runtime.paths)),
    { agentId, channel },
  );
}

function statusEntry(
  sessionId: string,
  session: SessionPathSummary,
  now: number,
  staleAfterMs: number,
): SessionStatusEntry | undefined {
  if (!session.exists || !session.updatedAt) return undefined;
  const updatedAtMs = Date.parse(session.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return undefined;
  const ageMs = Math.max(0, now - updatedAtMs);
  return {
    sessionId,
    name: session.name,
    path: session.path,
    updatedAt: session.updatedAt,
    updatedAtMs,
    ageMs,
    status: ageMs > staleAfterMs ? "stale" : "recent",
  };
}
