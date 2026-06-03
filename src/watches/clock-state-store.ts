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

    const nextRunAtMs = (value as Record<string, unknown>).nextRunAtMs;
    if (nextRunAtMs !== undefined && typeof nextRunAtMs !== "number") {
      continue;
    }

    result[watchId] = { nextRunAtMs };
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
