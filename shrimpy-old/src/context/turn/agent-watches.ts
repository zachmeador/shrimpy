import { inspectWatches, type WatchInspection } from "../../watches/inspection.js";
import {
  formatAgeShort,
  formatFutureOrPast,
} from "../../util/time-format.js";
import type { TurnContextInput, TurnContextItem } from "./types.js";

const MAX_WATCHES_IN_TURN_CONTEXT = 5;
const MAX_WATCH_SUMMARY_CHARS = 190;
const MAX_WATCHES_SUMMARY_CHARS = 900;

const ROUTINE_DIAGNOSTICS = new Set([
  "watch clock has no next run recorded yet",
  "watch clock has no next run recorded yet; computed fallback shown",
  "no watch run history recorded yet",
  "watch is disabled",
]);

export function buildAgentWatchItems(input: {
  turn: TurnContextInput;
  agentId: string;
}): TurnContextItem[] {
  if (!isKnownAgent(input.turn, input.agentId)) return [];

  const watches = inspectWatches(input.turn.runtime, {
    agentId: input.agentId,
  });
  if (watches.length === 0) {
    return [{
      id: `watches:${input.agentId}:none`,
      summary: `watches: no configured watches for ${input.agentId}`,
      inspect: `shrimpy watches --agent ${input.agentId}`,
      revision: "none",
    }];
  }

  const nowMs = Date.now();
  const ordered = [...watches].sort((a, b) => compareWatchesForContext(a, b, nowMs));
  const visible = ordered.slice(0, MAX_WATCHES_IN_TURN_CONTEXT);
  const overflow = watches.length - visible.length;
  const summaries = visible.map((watch) => formatWatchSummary(watch, nowMs));
  if (overflow > 0) summaries.push(`+${overflow} more`);

  return [{
    id: `watches:${input.agentId}`,
    summary: clipOneLine(
      `watches: ${watches.length} configured; ${summaries.join("; ")}`,
      MAX_WATCHES_SUMMARY_CHARS,
    ),
    inspect: `shrimpy watches --agent ${input.agentId}`,
    revision: JSON.stringify(watches.map((watch) => [
      watch.id,
      watch.enabled,
      watch.triggerText,
      watch.targetChannels,
      watch.nextRunAtMs ?? null,
      watch.lastRun?.status ?? null,
      watch.lastRun?.finishedAtMs ?? null,
      watch.activeRun?.runId ?? null,
      watch.activeRun?.startedAtMs ?? null,
      watch.diagnostics,
    ])),
  }];
}

function isKnownAgent(input: TurnContextInput, agentId: string): boolean {
  try {
    input.runtime.getAgent(agentId);
    return true;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("unknown agent:")) {
      return false;
    }
    throw err;
  }
}

function formatWatchSummary(watch: WatchInspection, nowMs: number): string {
  const state = watch.enabled ? "enabled" : "disabled";
  const targets = watch.targetChannels.length > 0
    ? `channels=${watch.targetChannels.join(",")}`
    : "channels=(none)";
  const next = watch.enabled
    ? watch.nextRunAtMs === undefined
      ? "next=unknown"
      : `next=${formatFutureOrPast(watch.nextRunAtMs, nowMs)}`
    : "next=disabled";
  const last = watch.lastRun
    ? `last=${watch.lastRun.status} ${formatAgeShort(nowMs - watch.lastRun.finishedAtMs)} ago`
    : "last=none";
  const active = watch.activeRun
    ? ` active=${watch.activeRun.runId} ${formatAgeShort(nowMs - watch.activeRun.startedAtMs)} ago`
    : "";
  const diagnostic = formatImportantDiagnostic(watch);

  return clipOneLine(
    `${watch.id} local=${watch.localId} ${state} ${watch.triggerText} ${targets} ${next} ${last}${active}${diagnostic}`,
    MAX_WATCH_SUMMARY_CHARS,
  );
}

function formatImportantDiagnostic(watch: WatchInspection): string {
  const important = watch.diagnostics.filter((diagnostic) =>
    !ROUTINE_DIAGNOSTICS.has(diagnostic)
  );
  if (important.length === 0) return "";

  const failure = important.find((diagnostic) =>
    /\b(fail|failed|error)\b/i.test(diagnostic)
  );
  if (failure) return ` diagnostic=${clipOneLine(failure, 80)}`;
  return ` diagnostics=${important.length}`;
}

function compareWatchesForContext(
  a: WatchInspection,
  b: WatchInspection,
  nowMs: number,
): number {
  const rank = attentionRank(a, nowMs) - attentionRank(b, nowMs);
  if (rank !== 0) return rank;

  const next = compareOptionalAscending(a.nextRunAtMs, b.nextRunAtMs);
  if (next !== 0) return next;

  const last = compareOptionalDescending(a.lastRun?.finishedAtMs, b.lastRun?.finishedAtMs);
  if (last !== 0) return last;

  return a.id.localeCompare(b.id);
}

function attentionRank(watch: WatchInspection, nowMs: number): number {
  if (watch.activeRun) return 0;
  if (watch.nextRunAtMs !== undefined && watch.nextRunAtMs <= nowMs) return 1;
  if (watch.nextRunAtMs !== undefined) return 2;
  if (watch.lastRun) return 3;
  return 4;
}

function compareOptionalAscending(
  a: number | undefined,
  b: number | undefined,
): number {
  if (a !== undefined && b !== undefined) return a - b;
  if (a !== undefined) return -1;
  if (b !== undefined) return 1;
  return 0;
}

function compareOptionalDescending(
  a: number | undefined,
  b: number | undefined,
): number {
  if (a !== undefined && b !== undefined) return b - a;
  if (a !== undefined) return -1;
  if (b !== undefined) return 1;
  return 0;
}

function clipOneLine(text: string, max: number): string {
  const oneLine = text.replaceAll(/\s+/g, " ").trim();
  return oneLine.length <= max
    ? oneLine
    : `${oneLine.slice(0, max - 23).trimEnd()} ... [truncated]`;
}
