import type { SchedulerStateSnapshot } from "./engine.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";

function parseSchedulerState(raw: unknown): SchedulerStateSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: SchedulerStateSnapshot = {};
  for (const [scheduleId, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const nextRunAtMs = (value as Record<string, unknown>).nextRunAtMs;
    if (nextRunAtMs !== undefined && typeof nextRunAtMs !== "number") {
      continue;
    }

    result[scheduleId] = { nextRunAtMs };
  }
  return result;
}

export function loadSchedulerState(
  statePath: string,
): SchedulerStateSnapshot {
  return readJsonFile(statePath, () => ({}), parseSchedulerState);
}

export function saveSchedulerState(
  statePath: string,
  state: SchedulerStateSnapshot,
): void {
  writeJsonFileAtomic(statePath, state);
}
