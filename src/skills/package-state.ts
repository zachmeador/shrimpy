import { join } from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "../util/json-file.js";
import { normalizeSkillId, uniqueStrings } from "./shared.js";

const SKILL_PACKAGES_DIR = "state/skills/packages";
const SKILL_PACKAGES_FILE = "state/skills/packages.json";
const SKILL_BINDINGS_FILE = "state/skills/bindings.json";

export type SkillPackageSourceKind = "local-directory" | "local-file" | "url" | "github";
export type SkillPackageSourceRevisionKind = "tree" | "blob" | "hash";

export interface GitHubSkillPackageInfo {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  resolvedRef: string;
  resolvedSha: string;
  sourceRevision: string;
  sourceRevisionKind: Extract<SkillPackageSourceRevisionKind, "tree" | "blob">;
  htmlUrl: string;
}

export interface SkillPackageInfo {
  id: string;
  rootPath: string;
  entryPath: string;
  source: string;
  sourceKind: SkillPackageSourceKind;
  fetchedAt: string;
  hash: string;
  sourceRevision?: string;
  sourceRevisionKind?: SkillPackageSourceRevisionKind;
  github?: GitHubSkillPackageInfo;
}

export interface SkillPackageCandidate {
  id: string;
  name: string;
  description: string;
  source: string;
  sourceKind: SkillPackageSourceKind;
  path: string;
  entryPath: string;
  sourceRevision?: string;
  sourceRevisionKind?: SkillPackageSourceRevisionKind;
  github?: GitHubSkillPackageInfo;
}

export interface SkillPackagesState {
  packages: Record<string, SkillPackageInfo>;
}

export interface SkillBindingsState {
  workspace: string[];
  agents: Record<string, string[]>;
}

export function skillPackageRootPath(workspacePath: string, skillId: string): string {
  return join(workspacePath, SKILL_PACKAGES_DIR, ...skillId.split("/"));
}

export function readSkillPackagesState(workspacePath: string): SkillPackagesState {
  return readJsonFile(
    skillPackagesStatePath(workspacePath),
    () => ({ packages: {} }),
    (raw) => parseSkillPackagesState(raw),
  );
}

export function writeSkillPackagesState(
  workspacePath: string,
  state: SkillPackagesState,
): void {
  writeJsonFileAtomic(skillPackagesStatePath(workspacePath), state);
}

export function readSkillBindingsState(workspacePath: string): SkillBindingsState {
  return readJsonFile(
    skillBindingsStatePath(workspacePath),
    () => ({ workspace: [], agents: {} }),
    (raw) => parseSkillBindingsState(raw),
  );
}

export function writeSkillBindingsState(
  workspacePath: string,
  state: SkillBindingsState,
): void {
  writeJsonFileAtomic(skillBindingsStatePath(workspacePath), state);
}

export function bindSkillPackage(
  workspacePath: string,
  opts: {
    id: string;
    scope: "agent" | "workspace";
    agentId?: string;
  },
): SkillBindingsState {
  const skillId = normalizeSkillId(opts.id);
  const bindings = readSkillBindingsState(workspacePath);
  if (opts.scope === "workspace") {
    bindings.workspace = uniqueStrings([...bindings.workspace, skillId]);
  } else {
    const agentId = opts.agentId;
    if (!agentId) throw new Error("agent id is required for agent skill binding");
    bindings.agents[agentId] = uniqueStrings([
      ...(bindings.agents[agentId] ?? []),
      skillId,
    ]);
  }
  writeSkillBindingsState(workspacePath, bindings);
  return bindings;
}

export function unbindSkillPackage(
  workspacePath: string,
  opts: {
    id: string;
    scope: "agent" | "workspace";
    agentId?: string;
  },
): SkillBindingsState {
  const skillId = normalizeSkillId(opts.id);
  const bindings = readSkillBindingsState(workspacePath);
  if (opts.scope === "workspace") {
    bindings.workspace = bindings.workspace.filter((id) => id !== skillId);
  } else {
    const agentId = opts.agentId;
    if (!agentId) throw new Error("agent id is required for agent skill binding");
    bindings.agents[agentId] = (bindings.agents[agentId] ?? [])
      .filter((id) => id !== skillId);
  }
  writeSkillBindingsState(workspacePath, bindings);
  return bindings;
}

function skillPackagesStatePath(workspacePath: string): string {
  return join(workspacePath, SKILL_PACKAGES_FILE);
}

function skillBindingsStatePath(workspacePath: string): string {
  return join(workspacePath, SKILL_BINDINGS_FILE);
}

function parseSkillPackagesState(raw: unknown): SkillPackagesState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { packages: {} };
  }
  const rawPackages = (raw as { packages?: unknown }).packages;
  if (!rawPackages || typeof rawPackages !== "object" || Array.isArray(rawPackages)) {
    return { packages: {} };
  }
  const packages: Record<string, SkillPackageInfo> = {};
  for (const [id, info] of Object.entries(rawPackages)) {
    if (!info || typeof info !== "object" || Array.isArray(info)) continue;
    const candidate = info as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" ||
      typeof candidate.rootPath !== "string" ||
      typeof candidate.entryPath !== "string" ||
      typeof candidate.source !== "string" ||
      typeof candidate.sourceKind !== "string" ||
      typeof candidate.fetchedAt !== "string" ||
      typeof candidate.hash !== "string"
    ) {
      continue;
    }
    const packageInfo = candidate as unknown as SkillPackageInfo;
    if (typeof candidate.sourceRevision === "string") {
      packageInfo.sourceRevision = candidate.sourceRevision;
    }
    if (typeof candidate.sourceRevisionKind === "string") {
      packageInfo.sourceRevisionKind = candidate.sourceRevisionKind as SkillPackageSourceRevisionKind;
    }
    if (candidate.github && typeof candidate.github === "object" && !Array.isArray(candidate.github)) {
      const github = candidate.github as Record<string, unknown>;
      if (
        typeof github.owner === "string" &&
        typeof github.repo === "string" &&
        typeof github.path === "string" &&
        typeof github.ref === "string" &&
        typeof github.resolvedRef === "string" &&
        typeof github.resolvedSha === "string" &&
        typeof github.sourceRevision === "string" &&
        typeof github.sourceRevisionKind === "string" &&
        typeof github.htmlUrl === "string"
      ) {
        packageInfo.github = github as unknown as GitHubSkillPackageInfo;
      }
    }
    packages[normalizeSkillId(id)] = packageInfo;
  }
  return { packages };
}

function parseSkillBindingsState(raw: unknown): SkillBindingsState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { workspace: [], agents: {} };
  }
  const candidate = raw as { workspace?: unknown; agents?: unknown };
  const agents: Record<string, string[]> = {};
  if (candidate.agents && typeof candidate.agents === "object" && !Array.isArray(candidate.agents)) {
    for (const [agentId, ids] of Object.entries(candidate.agents)) {
      agents[agentId] = Array.isArray(ids)
        ? uniqueStrings(ids.filter((id): id is string => typeof id === "string").map(normalizeSkillId))
        : [];
    }
  }
  return {
    workspace: Array.isArray(candidate.workspace)
      ? uniqueStrings(candidate.workspace.filter((id): id is string => typeof id === "string").map(normalizeSkillId))
      : [],
    agents,
  };
}
