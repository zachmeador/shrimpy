import type { AppRuntime } from "../../app/runtime.js";
import { createWorkspacePaths } from "../../workspace/paths.js";
import { listWorkers } from "../../workers/store.js";
import type { WorkerRecord, WorkerStatus } from "../../workers/types.js";
import { formatAgeShort } from "../../util/time-format.js";
import { clipOneLine } from "../../util/text.js";
import type { TurnContextInput, TurnContextItem } from "./types.js";
import { sessionChannel } from "../../sessions/spec.js";

const ACTIONABLE_STATUSES = new Set<WorkerStatus>(["complete", "blocked", "failed", "cancelled"]);

export interface WorkerOutcomeSummary {
  total: number;
  byStatus: Partial<Record<WorkerStatus, number>>;
}

export function buildWorkerContextItems(input: {
  turn: TurnContextInput;
  agentId: string;
}): TurnContextItem[] {
  if (input.turn.currentMessage?.origin.transport === "watch") return [];
  const workers = ownedOpenWorkers(input.turn.runtime, input.agentId);
  if (workers.length === 0) return [];

  const currentSession = input.turn.descriptor.storage.kind === "durable"
    ? input.turn.descriptor.storage.dir
    : undefined;
  const currentChannel = sessionChannel(input.turn.descriptor);
  const currentSessionWorkers = currentSession
    ? workers.filter((worker) => worker.parent.session === currentSession)
    : [];
  const currentChannelWorkers = currentChannel
    ? workers.filter((worker) => worker.relatedChannel === currentChannel && worker.parent.session !== currentSession)
    : [];
  const detailed = [
    ...currentSessionWorkers,
    ...currentChannelWorkers,
  ]
    .sort(compareWorkersForAttention)
    .slice(0, 3)
    .map((worker) => workerItem(worker, relevanceLabel(worker, currentSession, currentChannel)));

  const detailedIds = new Set([
    ...currentSessionWorkers,
    ...currentChannelWorkers,
  ].map((worker) => worker.id));
  const otherActionable = workers.filter(
    (worker) => !detailedIds.has(worker.id) && ACTIONABLE_STATUSES.has(worker.status),
  );
  if (otherActionable.length > 0) {
    detailed.push({
      id: "workers:owned:actionable",
      summary: `workers: ${formatWorkerOutcomeCounts(summarizeWorkerOutcomes(otherActionable))} owned worker${otherActionable.length === 1 ? "" : "s"} need review`,
      inspect: "shrimpy worker list",
    });
  }

  return detailed;
}

export function buildWorkerSessionStatusItems(input: {
  runtime: AppRuntime;
  agentId: string;
}): TurnContextItem[] {
  const actionable = ownedOpenWorkers(input.runtime, input.agentId)
    .filter((worker) => ACTIONABLE_STATUSES.has(worker.status));
  if (actionable.length === 0) return [];
  return [{
    id: "workers:status",
    summary: `workers: ${formatWorkerOutcomeCounts(summarizeWorkerOutcomes(actionable))} need review`,
    inspect: "shrimpy worker list",
  }];
}

function ownedOpenWorkers(runtime: AppRuntime, agentId: string): WorkerRecord[] {
  return listWorkers(createWorkspacePaths(runtime.config.workspace).workersStatePath)
    .filter((worker) => worker.ownerAgent === agentId && worker.status !== "closed");
}

function workerItem(worker: WorkerRecord, relevance: string): TurnContextItem {
  const latest = worker.turns.at(-1);
  const finishedAt = latest?.finishedAt ?? worker.updatedAt;
  const age = ageFromIso(finishedAt);
  const result = latest?.output ?? latest?.error ?? worker.summary;
  const suffix = result ? `; ${clipOneLine(result, 140)}` : "";
  return {
    id: `workers:${worker.id}`,
    summary: `worker ${worker.id} ${worker.status} (${relevance}) ${age} ago: ${clipOneLine(worker.goal, 80)}${suffix}`,
    inspect: `shrimpy worker read ${worker.id}`,
  };
}

function relevanceLabel(
  worker: WorkerRecord,
  currentSession: string | undefined,
  currentChannel?: string,
): string {
  if (worker.parent.session === currentSession) return "current session";
  if (currentChannel && worker.relatedChannel === currentChannel) return "current channel";
  return "owned";
}

function summarizeWorkerOutcomes(workers: WorkerRecord[]): WorkerOutcomeSummary {
  const byStatus: Partial<Record<WorkerStatus, number>> = {};
  for (const worker of workers) {
    byStatus[worker.status] = (byStatus[worker.status] ?? 0) + 1;
  }
  return { total: workers.length, byStatus };
}

function formatWorkerOutcomeCounts(summary: WorkerOutcomeSummary): string {
  const ordered: WorkerStatus[] = ["blocked", "failed", "complete", "cancelled", "running", "closed"];
  const pieces = ordered.flatMap((status) => {
    const count = summary.byStatus[status] ?? 0;
    return count > 0 ? [`${count} ${status}`] : [];
  });
  return pieces.join(", ") || `${summary.total} worker${summary.total === 1 ? "" : "s"}`;
}

function compareWorkersForAttention(a: WorkerRecord, b: WorkerRecord): number {
  const status = statusRank(a.status) - statusRank(b.status);
  if (status !== 0) return status;
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

function statusRank(status: WorkerStatus): number {
  switch (status) {
    case "blocked":
      return 0;
    case "failed":
      return 1;
    case "complete":
      return 2;
    case "cancelled":
      return 3;
    case "running":
      return 4;
    case "closed":
      return 5;
  }
}

function ageFromIso(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "unknown time";
  return formatAgeShort(Date.now() - parsed);
}
