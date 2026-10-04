import { existsSync, unlinkSync } from "node:fs";
import type { AppRuntime } from "../app/runtime.js";
import { readJsonFile, writeJsonFileAtomic } from "../util/json-file.js";
import { isRecord } from "../util/record.js";

export interface WatchLoadError {
  agentId: string;
  path: string;
  message: string;
  recordedAtMs: number;
}

const LOAD_ERROR_MESSAGE = "watch file could not be parsed or validated";

export function createWatchLoadError(
  agentId: string,
  path: string,
  recordedAtMs = Date.now(),
): WatchLoadError {
  return {
    agentId,
    path,
    message: LOAD_ERROR_MESSAGE,
    recordedAtMs,
  };
}

export function loadWatchLoadErrors(runtime: AppRuntime): WatchLoadError[] {
  return readJsonFile(
    runtime.paths.watchLoadErrorsPath,
    () => [],
    parseWatchLoadErrors,
  );
}

export function saveWatchLoadErrors(
  runtime: AppRuntime,
  errors: Iterable<WatchLoadError>,
): void {
  const ordered = [...errors].sort((a, b) => a.agentId.localeCompare(b.agentId));
  if (ordered.length === 0) {
    if (existsSync(runtime.paths.watchLoadErrorsPath)) {
      unlinkSync(runtime.paths.watchLoadErrorsPath);
    }
    return;
  }
  writeJsonFileAtomic(runtime.paths.watchLoadErrorsPath, ordered);
}

function parseWatchLoadErrors(raw: unknown): WatchLoadError[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.agentId !== "string" ||
      typeof entry.path !== "string" ||
      typeof entry.message !== "string" ||
      typeof entry.recordedAtMs !== "number"
    ) {
      return [];
    }
    return [{
      agentId: entry.agentId,
      path: entry.path,
      message: entry.message,
      recordedAtMs: entry.recordedAtMs,
    }];
  });
}
