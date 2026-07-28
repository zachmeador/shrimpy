import {
  existsSync,
  promises as fs,
  realpathSync,
  readFileSync,
} from "node:fs";
import { homedir } from "node:os";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import type { NodeKind } from "../shared/types.js";

export interface WebAgent {
  id: string;
  configuredRoot: string;
  root: string;
}

interface WorkspaceConfig {
  agents?: unknown;
}

const TEXT_EXTENSIONS = new Set([
  ".css",
  ".csv",
  ".html",
  ".js",
  ".json",
  ".jsonl",
  ".log",
  ".md",
  ".mjs",
  ".sh",
  ".svg",
  ".toml",
  ".ts",
  ".txt",
  ".yaml",
  ".yml",
]);

const PRIVATE_PATHS = new Set([
  "config/shrimpy.json",
  "state/pi/auth.json",
  "state/pi/models.json",
  "state/pi/models-store.json",
]);

export function resolveWorkspacePath(
  override?: string,
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
  home = homedir(),
): string {
  if (override) return resolve(override);

  const fromEnv = env.SHRIMPY_WORKSPACE?.trim();
  if (fromEnv) return isAbsolute(fromEnv) ? fromEnv : resolve(cwd, fromEnv);

  let current = resolve(cwd);
  while (true) {
    const candidate = join(current, ".shrimpy");
    if (existsSync(join(candidate, "config", "shrimpy.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  const pointer = join(home, ".shrimpy-workspace.json");
  const value = readJson(pointer);
  if (isRecord(value) && typeof value.workspace === "string" && value.workspace) {
    return resolve(value.workspace);
  }

  return join(home, ".shrimpy");
}

export function readWorkspaceConfig(workspace: string): WorkspaceConfig {
  const value = readJson(join(workspace, "config", "shrimpy.json"));
  return isRecord(value) ? value : {};
}

export function resolveAgents(workspace: string): WebAgent[] {
  const config = readWorkspaceConfig(workspace);
  if (!Array.isArray(config.agents)) {
    const defaultAgent = agentFrom(workspace, "shrimpy", "agents/shrimpy");
    return defaultAgent ? [defaultAgent] : [];
  }

  const agents = config.agents.flatMap((value): WebAgent[] => {
    if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) {
      return [];
    }
    const id = value.id.trim();
    const configuredRoot = typeof value.root === "string" && value.root.trim()
      ? value.root.trim()
      : `agents/${id}`;
    const agent = agentFrom(workspace, id, configuredRoot);
    return agent ? [agent] : [];
  });
  return agents;
}

function agentFrom(
  workspace: string,
  id: string,
  configuredRoot: string,
): WebAgent | null {
  if (isAbsolute(configuredRoot)) return null;
  const workspaceRoot = safeRealpath(workspace);
  const root = safeRealpath(resolve(workspaceRoot, configuredRoot));
  if (!isContained(workspaceRoot, root)) return null;
  return {
    id,
    configuredRoot,
    root,
  };
}

export function classifyWorkspaceFile(relPath: string): {
  kind: NodeKind;
  readable: boolean;
} {
  const normalized = normalizeRelativePath(relPath);
  if (
    PRIVATE_PATHS.has(normalized)
    || normalized.startsWith("state/telegram/")
    || normalized.startsWith("runtime/bin/")
    || isSecretName(normalized)
  ) {
    return { kind: "private", readable: false };
  }

  const extension = extname(normalized).toLowerCase();
  if (normalized.startsWith("channels/") && extension === ".jsonl") {
    return { kind: "channel", readable: true };
  }
  if (isSessionLog(normalized)) {
    return { kind: "session", readable: true };
  }
  if (extension === ".jsonl") return { kind: "jsonl", readable: true };
  if (extension === ".md") return { kind: "markdown", readable: true };
  if (extension === ".json") return { kind: "json", readable: true };
  if (extension === ".log") return { kind: "log", readable: true };
  if (extension === ".sh") return { kind: "script", readable: true };
  if (normalized.startsWith("media/")) return { kind: "media", readable: false };
  if (TEXT_EXTENSIONS.has(extension)) return { kind: "text", readable: true };
  return { kind: "other", readable: false };
}

export async function resolveContainedFile(
  root: string,
  relPath: string,
): Promise<string | null> {
  const normalized = normalizeRelativePath(relPath);
  if (!normalized || normalized.startsWith("../") || isAbsolute(normalized)) {
    return null;
  }

  let rootReal: string;
  try {
    rootReal = await fs.realpath(root);
  } catch {
    return null;
  }

  const candidate = resolve(rootReal, normalized);
  if (!isContained(rootReal, candidate)) return null;

  let candidateReal: string;
  try {
    candidateReal = await fs.realpath(candidate);
  } catch {
    return null;
  }
  if (!isContained(rootReal, candidateReal)) return null;

  const stat = await fs.stat(candidateReal);
  return stat.isFile() ? candidateReal : null;
}

export function workspaceRelative(workspace: string, path: string): string {
  return normalizeRelativePath(relative(workspace, path));
}

export function normalizeRelativePath(path: string): string {
  const normalized = posix.normalize(path.replaceAll("\\", "/"))
    .replace(/^\.\/+/, "");
  return normalized === "." ? "" : normalized;
}

export function revisionFor(stat: { size: number; mtimeMs: number }): string {
  return `${Math.trunc(stat.mtimeMs)}:${stat.size}`;
}

export function readJson(path: string): unknown {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function safeRealpath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isContained(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function isSessionLog(relPath: string): boolean {
  return /(^|\/)sessions\/(local|channel|worker)\/[^/]+\/[^/]+\/[^/]+\.jsonl$/.test(
    relPath,
  );
}

function isSecretName(relPath: string): boolean {
  const name = relPath.split("/").at(-1)?.toLowerCase() ?? "";
  return name === ".env"
    || name.endsWith(".pem")
    || name.endsWith(".key")
    || name === "credentials.json";
}
