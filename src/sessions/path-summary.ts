import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import { findActiveSessionFile } from "./transcript-store.js";

export interface SessionPathSummary {
  name: string;
  path: string;
  exists: boolean;
  updatedAt: string | null;
}

export function summarizeSessionPath(path: string): SessionPathSummary {
  const exists = existsSync(path);
  return {
    name: basename(path),
    path,
    exists,
    updatedAt: exists ? new Date(statSync(path).mtimeMs).toISOString() : null,
  };
}

export function summarizeActiveSessionPath(
  sessionDir: string,
): SessionPathSummary {
  const active = findActiveSessionFile(sessionDir);
  return active
    ? summarizeSessionPath(active)
    : {
      name: basename(sessionDir),
      path: sessionDir,
      exists: false,
      updatedAt: null,
    };
}
