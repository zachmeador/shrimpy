import type { AppRuntime } from "../app/runtime.js";
import {
  summarizeAgentSessions,
  type SessionPathSummary,
} from "./service.js";

export type SessionRecencyStatus = "recent" | "stale";

export interface SessionStatusEntry {
  channel: string;
  name: string;
  path: string;
  updatedAt: string;
  updatedAtMs: number;
  ageMs: number;
  status: SessionRecencyStatus;
}

export interface SessionStatusSummary {
  agentId: string;
  sessionsRoot: string;
  staleAfterMs: number;
  counts: {
    active: number;
    recent: number;
    stale: number;
  };
  active: SessionStatusEntry[];
  mostRecent?: SessionStatusEntry;
}

export function summarizeSessionStatus(
  runtime: AppRuntime,
  opts?: {
    agentId?: string;
    staleAfterMs?: number;
  },
): SessionStatusSummary {
  const agent = runtime.getAgent(opts?.agentId);
  const staleAfterMs = opts?.staleAfterMs ?? 12 * 60 * 60 * 1000;
  const listing = summarizeAgentSessions(runtime, { agentId: agent.id });
  if ("channel" in listing) {
    throw new Error("session status requires an agent-wide session listing");
  }
  const now = Date.now();
  const active = listing.active
    .flatMap((session): SessionStatusEntry[] => {
      const entry = sessionStatusEntry(session, now, staleAfterMs);
      return entry ? [entry] : [];
    })
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  const stale = active.filter((session) => session.status === "stale").length;
  const recent = active.length - stale;

  return {
    agentId: listing.agentId,
    sessionsRoot: listing.sessionsRoot,
    staleAfterMs,
    counts: {
      active: active.length,
      recent,
      stale,
    },
    active,
    mostRecent: active[0],
  };
}

export function formatSessionAge(ms: number): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function sessionStatusEntry(
  session: SessionPathSummary & { channel: string },
  now: number,
  staleAfterMs: number,
): SessionStatusEntry | undefined {
  if (!session.exists || !session.updatedAt) return undefined;
  const updatedAtMs = Date.parse(session.updatedAt);
  if (!Number.isFinite(updatedAtMs)) return undefined;
  const ageMs = Math.max(0, now - updatedAtMs);
  return {
    channel: session.channel,
    name: session.name,
    path: session.path,
    updatedAt: session.updatedAt,
    updatedAtMs,
    ageMs,
    status: ageMs > staleAfterMs ? "stale" : "recent",
  };
}
