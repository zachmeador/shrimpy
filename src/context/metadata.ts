import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { findLastCustomEntry } from "../sessions/transcript-store.js";
import { isRecord } from "../util/record.js";

interface ShrimpySessionMetadata {
  workspacePath: string;
  agentId: string;
  sessionType: string;
  channel?: string;
  envKeys: string[];
  env: Record<string, string>;
}

export function readSessionMetadata(
  sessionDir: string,
): ShrimpySessionMetadata | undefined {
  const sessionFile = findNewestSessionFile(sessionDir);
  if (!sessionFile) return undefined;

  const lines = readFileSync(sessionFile, "utf-8").split(/\r?\n/).filter(Boolean);
  return parseMetadata(findLastCustomEntry(lines, "shrimpy_session_metadata")?.data);
}

function findNewestSessionFile(sessionDir: string): string | undefined {
  if (!existsSync(sessionDir)) return undefined;
  const files = readdirSync(sessionDir)
    .filter((file) => file.endsWith(".jsonl"))
    .map((file) => join(sessionDir, file))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0];
}

function parseMetadata(value: unknown): ShrimpySessionMetadata | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.workspacePath !== "string") return undefined;
  if (typeof value.agentId !== "string") return undefined;
  if (typeof value.sessionType !== "string") return undefined;
  return {
    workspacePath: value.workspacePath,
    agentId: value.agentId,
    sessionType: value.sessionType,
    channel: typeof value.channel === "string" ? value.channel : undefined,
    envKeys: Array.isArray(value.envKeys)
      ? value.envKeys.filter((entry): entry is string => typeof entry === "string")
      : [],
    env: readStringRecord(value.env),
  };
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      typeof entry[1] === "string"
    ),
  );
}
