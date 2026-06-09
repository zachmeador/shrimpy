import { existsSync, mkdtempSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadSkills } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import {
  bindSkillPackage,
  readSkillPackagesState,
  skillPackageRootPath,
  unbindSkillPackage,
  writeSkillPackagesState,
  type SkillBindingsState,
  type SkillPackageCandidate,
  type SkillPackageInfo,
  type SkillPackageSourceKind,
} from "./package-state.js";
import {
  ensureUniqueSelectedSkillIds,
  hashPreparedPackageSource,
  hashSkillPackage,
  multipleSkillCandidatesMessage,
  preparePackageSourceForUpdate,
  preparePackageSources,
  toSkillPackageCandidate,
  writePreparedPackageSource,
  type PreparedPackageSource,
} from "./package-sources.js";
import { normalizeSkillId, SKILL_ENTRYPOINT } from "./shared.js";

export type {
  GitHubSkillPackageInfo,
  SkillBindingsState,
  SkillPackageCandidate,
  SkillPackageInfo,
  SkillPackagesState,
  SkillPackageSourceKind,
  SkillPackageSourceRevisionKind,
} from "./package-state.js";

export { bindSkillPackage, unbindSkillPackage } from "./package-state.js";

export interface AddSkillPackageOptions {
  runtime: AppRuntime;
  source: string;
  scope: "agent" | "workspace";
  agentId?: string;
  id?: string;
  force?: boolean;
  ref?: string;
  path?: string;
  all?: boolean;
  dryRun?: boolean;
}

export interface AddSkillPackageResult {
  dryRun: boolean;
  source: string;
  sourceKind: SkillPackageSourceKind;
  candidates: SkillPackageCandidate[];
  selectedCandidates: SkillPackageCandidate[];
  packages: SkillPackageInfo[];
}

export interface UpdateSkillPackageOptions {
  runtime: AppRuntime;
  id: string;
  dryRun?: boolean;
}

export interface UpdateSkillPackageResult {
  id: string;
  dryRun: boolean;
  updateAvailable: boolean;
  checkedAt: string;
  current: SkillPackageInfo;
  latest?: SkillPackageCandidate;
  packageInfo?: SkillPackageInfo;
  reason?: string;
}

export interface SkillPackageBindingOptions {
  runtime: AppRuntime;
  id: string;
  scope: "agent" | "workspace";
  agentId?: string;
}

export interface SkillPackageBindingResult {
  id: string;
  scope: "agent" | "workspace";
  agentId?: string;
  packageInfo: SkillPackageInfo;
  bindings: SkillBindingsState;
}

export async function addSkillPackage(
  opts: AddSkillPackageOptions,
): Promise<AddSkillPackageResult> {
  const agent = opts.runtime.getAgent(opts.agentId);
  const packageSources = await preparePackageSources(opts.source, {
    ref: opts.ref,
    path: opts.path,
  });
  if (packageSources.length === 0) {
    throw new Error(`no skill packages found in source: ${opts.source}`);
  }
  if (opts.id && (opts.all || packageSources.length > 1)) {
    throw new Error("--id can only be used when one skill package is selected");
  }
  if (packageSources.length > 1 && !opts.all) {
    const candidates = packageSources.map((source) => toSkillPackageCandidate(source));
    if (opts.dryRun) {
      return {
        dryRun: true,
        source: opts.source,
        sourceKind: packageSources[0]!.kind,
        candidates,
        selectedCandidates: [],
        packages: [],
      };
    }
    throw new Error(multipleSkillCandidatesMessage(opts.source, candidates));
  }

  const selectedSources = opts.all ? packageSources : [packageSources[0]!];
  ensureUniqueSelectedSkillIds(selectedSources, opts.id);
  const selectedCandidates = selectedSources.map((source) =>
    toSkillPackageCandidate(source, opts.id)
  );

  if (opts.dryRun) {
    return {
      dryRun: true,
      source: opts.source,
      sourceKind: packageSources[0]!.kind,
      candidates: packageSources.map((source) => toSkillPackageCandidate(source)),
      selectedCandidates,
      packages: [],
    };
  }

  const packages: SkillPackageInfo[] = [];
  for (const source of selectedSources) {
    packages.push(await installPreparedSkillPackage({
      runtime: opts.runtime,
      agentId: agent.id,
      source,
      skillId: normalizeSkillId(opts.id ?? source.skillName),
      force: opts.force,
      originalSource: opts.source,
      bind: {
        scope: opts.scope,
        agentId: agent.id,
      },
    }));
  }

  return {
    dryRun: false,
    source: opts.source,
    sourceKind: packageSources[0]!.kind,
    candidates: packageSources.map((source) => toSkillPackageCandidate(source)),
    selectedCandidates,
    packages,
  };
}

export function bindInstalledSkillPackage(
  opts: SkillPackageBindingOptions,
): SkillPackageBindingResult {
  const skillId = normalizeSkillId(opts.id);
  const packageInfo = readSkillPackagesState(opts.runtime.paths.workspace).packages[skillId];
  if (!packageInfo) {
    throw new Error(`skill package not found: ${skillId}`);
  }
  const agentId = opts.scope === "agent"
    ? opts.runtime.getAgent(opts.agentId).id
    : undefined;
  const bindings = bindSkillPackage(opts.runtime.paths.workspace, {
    id: skillId,
    scope: opts.scope,
    agentId,
  });
  return {
    id: skillId,
    scope: opts.scope,
    agentId,
    packageInfo,
    bindings,
  };
}

export function unbindInstalledSkillPackage(
  opts: SkillPackageBindingOptions,
): SkillPackageBindingResult {
  const skillId = normalizeSkillId(opts.id);
  const packageInfo = readSkillPackagesState(opts.runtime.paths.workspace).packages[skillId];
  if (!packageInfo) {
    throw new Error(`skill package not found: ${skillId}`);
  }
  const agentId = opts.scope === "agent"
    ? opts.runtime.getAgent(opts.agentId).id
    : undefined;
  const bindings = unbindSkillPackage(opts.runtime.paths.workspace, {
    id: skillId,
    scope: opts.scope,
    agentId,
  });
  return {
    id: skillId,
    scope: opts.scope,
    agentId,
    packageInfo,
    bindings,
  };
}

export async function updateSkillPackage(
  opts: UpdateSkillPackageOptions,
): Promise<UpdateSkillPackageResult> {
  const skillId = normalizeSkillId(opts.id);
  const current = readSkillPackagesState(opts.runtime.paths.workspace).packages[skillId];
  if (!current) {
    throw new Error(`skill package not found: ${skillId}`);
  }

  const latestSource = await preparePackageSourceForUpdate(current);
  const latestCandidate = toSkillPackageCandidate(latestSource, skillId);
  const currentRevision = current.sourceRevision ?? current.hash;
  const latestRevision = latestSource.sourceRevision ??
    await hashPreparedPackageSource(latestSource);
  const updateAvailable = currentRevision !== latestRevision;
  const checkedAt = new Date().toISOString();

  if (opts.dryRun || !updateAvailable) {
    return {
      id: skillId,
      dryRun: Boolean(opts.dryRun),
      updateAvailable,
      checkedAt,
      current,
      latest: latestCandidate,
      reason: updateAvailable
        ? "update available"
        : "package source is unchanged",
    };
  }

  const agent = opts.runtime.getAgent();
  const packageInfo = await installPreparedSkillPackage({
    runtime: opts.runtime,
    agentId: agent.id,
    source: latestSource,
    skillId,
    force: true,
    originalSource: current.source,
  });

  return {
    id: skillId,
    dryRun: false,
    updateAvailable: true,
    checkedAt,
    current,
    latest: latestCandidate,
    packageInfo,
    reason: "package updated",
  };
}

async function installPreparedSkillPackage(opts: {
  runtime: AppRuntime;
  agentId: string;
  source: PreparedPackageSource;
  skillId: string;
  force: boolean | undefined;
  originalSource: string;
  bind?: {
    scope: "agent" | "workspace";
    agentId: string;
  };
}): Promise<SkillPackageInfo> {
  const skillId = normalizeSkillId(opts.skillId);
  const rootPath = skillPackageRootPath(opts.runtime.paths.workspace, skillId);
  const entryPath = join(rootPath, SKILL_ENTRYPOINT);
  const parentPath = dirname(rootPath);

  if (existsSync(rootPath) && !opts.force) {
    throw new Error(`skill package already exists: ${rootPath}`);
  }

  mkdirSync(parentPath, { recursive: true });
  const stagingPath = mkdtempSync(join(parentPath, ".tmp-"));
  const stagingEntryPath = join(stagingPath, SKILL_ENTRYPOINT);

  try {
    await writePreparedPackageSource(opts.source, stagingPath);

    const validation = loadSkills({
      cwd: opts.runtime.paths.workspace,
      agentDir: opts.runtime.getAgentPaths(opts.agentId).root,
      skillPaths: [stagingEntryPath],
      includeDefaults: false,
    });
    if (validation.skills.length !== 1) {
      const details = validation.diagnostics.map((diagnostic) => diagnostic.message).join("; ");
      throw new Error(`skill package did not load${details ? `: ${details}` : ""}`);
    }
    const loadedSkill = validation.skills[0]!;
    if (loadedSkill.name !== skillId) {
      throw new Error(
        `skill id "${skillId}" must match Pi skill name "${loadedSkill.name}"`,
      );
    }

    rmSync(rootPath, { recursive: true, force: true });
    renameSync(stagingPath, rootPath);
  } catch (error) {
    rmSync(stagingPath, { recursive: true, force: true });
    throw error;
  }

  const info: SkillPackageInfo = {
    id: skillId,
    rootPath,
    entryPath,
    source: opts.originalSource,
    sourceKind: opts.source.kind,
    fetchedAt: new Date().toISOString(),
    hash: hashSkillPackage(rootPath),
    sourceRevision: opts.source.sourceRevision,
    sourceRevisionKind: opts.source.sourceRevisionKind,
    github: opts.source.kind === "github" ? opts.source.github : undefined,
  };

  const packages = readSkillPackagesState(opts.runtime.paths.workspace);
  packages.packages[skillId] = info;
  writeSkillPackagesState(opts.runtime.paths.workspace, packages);
  if (opts.bind) {
    bindSkillPackage(opts.runtime.paths.workspace, {
      id: skillId,
      scope: opts.bind.scope,
      agentId: opts.bind.agentId,
    });
  }

  return info;
}
