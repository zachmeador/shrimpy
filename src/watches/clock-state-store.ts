import type { WatchClockStateSnapshot } from "./clock.js";
import {
  readJsonFile,
  writeJsonFileAtomic,
} from "../util/json-file.js";

function parseWatchClockState(raw: unknown): WatchClockStateSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const result: WatchClockStateSnapshot = {};
  for (const [watchId, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const entry = value as Record<string, unknown>;
    const nextRunAtMs = entry.nextRunAtMs;
    const scheduleKey = entry.scheduleKey;
    if (
      typeof nextRunAtMs !== "number" ||
      !Number.isFinite(nextRunAtMs) ||
      typeof scheduleKey !== "string"
    ) continue;

    result[watchId] = { nextRunAtMs, scheduleKey };
  }
  return result;
}

export function loadWatchClockState(
  statePath: string,
): WatchClockStateSnapshot {
  return readJsonFile(statePath, () => ({}), parseWatchClockState);
}

export function saveWatchClockState(
  statePath: string,
  state: WatchClockStateSnapshot,
): void {
  writeJsonFileAtomic(statePath, state);
}
