import { join } from "node:path";
import { readJsonFile, writeJsonFileAtomic } from "../util/json-file.js";
import { normalizeSkillId } from "./shared.js";

const SKILL_PACKAGES_FILE = "state/skills/packages.json";

export type SkillPackageSourceKind = "included" | "local-directory" | "local-file" | "url" | "github";
export type SkillPackageSourceRevisionKind = "tree" | "blob" | "hash";
export type SkillPackageInstallScope = "agent" | "workspace";
export type SkillPackageInstallKey = string;

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
  installKey: SkillPackageInstallKey;
  id: string;
  rootPath: string;
  entryPath: string;
  source: string;
  sourceKind: SkillPackageSourceKind;
  fetchedAt: string;
  hash: string;
  scope?: SkillPackageInstallScope;
  agentId?: string;
  installedPath?: string;
  sourceHash?: string;
  installedHash?: string;
  modified?: boolean;
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

export function skillPackageInstallKey(opts: {
  id: string;
  scope: SkillPackageInstallScope;
  agentId?: string;
}): SkillPackageInstallKey {
  const id = normalizeSkillId(opts.id);
  if (opts.scope === "workspace") return `workspace:${id}`;
  if (!opts.agentId) throw new Error("agent id is required for agent skill package install");
  return `agent:${opts.agentId}:${id}`;
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

function skillPackagesStatePath(workspacePath: string): string {
  return join(workspacePath, SKILL_PACKAGES_FILE);
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
    packageInfo.id = normalizeSkillId(candidate.id);
    if (candidate.scope === "agent" || candidate.scope === "workspace") {
      packageInfo.scope = candidate.scope;
    }
    if (typeof candidate.agentId === "string") {
      packageInfo.agentId = candidate.agentId;
    }
    if (typeof candidate.installedPath === "string") {
      packageInfo.installedPath = candidate.installedPath;
    }
    if (typeof candidate.sourceHash === "string") {
      packageInfo.sourceHash = candidate.sourceHash;
    }
    if (typeof candidate.installedHash === "string") {
      packageInfo.installedHash = candidate.installedHash;
    }
    if (typeof candidate.modified === "boolean") {
      packageInfo.modified = candidate.modified;
    }
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
    packageInfo.installKey = typeof candidate.installKey === "string"
      ? candidate.installKey
      : inferSkillPackageInstallKey(id, packageInfo);
    packages[packageInfo.installKey] = packageInfo;
  }
  return { packages };
}

function inferSkillPackageInstallKey(
  fallbackKey: string,
  info: SkillPackageInfo,
): SkillPackageInstallKey {
  if (info.scope === "workspace") {
    return skillPackageInstallKey({ id: info.id, scope: "workspace" });
  }
  if (info.scope === "agent" && info.agentId) {
    return skillPackageInstallKey({ id: info.id, scope: "agent", agentId: info.agentId });
  }
  return fallbackKey;
}
