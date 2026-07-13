import type { AppRuntime } from "../app/runtime.js";
import { formatAgeShort } from "../util/time-format.js";
import {
  summarizeAgentSessions,
  type SessionPathSummary,
} from "./service.js";

type SessionRecencyStatus = "recent" | "stale";

interface SessionStatusEntry {
  sessionId: string;
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
  if ("sessionId" in listing) {
    throw new Error("session status requires an agent-wide session listing");
  }
  const now = Date.now();
  const active = listing.sessions
    .flatMap((session): SessionStatusEntry[] => {
      const entry = sessionStatusEntry(session.sessionId, session.active, now, staleAfterMs);
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
  return formatAgeShort(ms);
}

function sessionStatusEntry(
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
