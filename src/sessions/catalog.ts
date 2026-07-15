import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
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
import { createSessionDescriptor, type SessionDescriptor } from "./spec.js";
import {
  findActiveSessionFile,
  findMostRecentSessionFile,
  listArchivedSessionFiles,
} from "./transcript-store.js";

export interface SessionPathSummary {
  name: string;
  path: string;
  exists: boolean;
  updatedAt: string | null;
}

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
    active: summarizeActivePath(descriptor.storage.dir),
    archives: listArchivedSessionFiles(descriptor.storage.dir).map(summarizePath),
    owner: readSessionOwner(runtime.paths.workspace, descriptor.key),
    gatewayLanes: channel ? gatewayLanesFor(runtime, descriptor.key.agentId, channel) : [],
  };
}

function summarizePath(path: string): SessionPathSummary {
  const exists = existsSync(path);
  return {
    name: basename(path),
    path,
    exists,
    updatedAt: exists ? new Date(statSync(path).mtimeMs).toISOString() : null,
  };
}

function summarizeActivePath(sessionDir: string): SessionPathSummary {
  const active = findActiveSessionFile(sessionDir);
  return active ? summarizePath(active) : {
    name: basename(sessionDir),
    path: sessionDir,
    exists: false,
    updatedAt: null,
  };
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
