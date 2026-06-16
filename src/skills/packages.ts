import { existsSync, mkdtempSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { loadSkills } from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import {
  readSkillPackagesState,
  skillPackageInstallKey,
  writeSkillPackagesState,
  type SkillPackageCandidate,
  type SkillPackageInstallKey,
  type SkillPackageInfo,
  type SkillPackageInstallScope,
  type SkillPackageSourceKind,
} from "./package-state.js";
import {
  copySkillDirectorySafe,
  ensureUniqueSelectedSkillIds,
  hashPreparedPackageSource,
  hashSkillPackage,
  multipleSkillCandidatesMessage,
  preparePackageSourceForUpdate,
  preparePackageSources,
  toSkillPackageCandidate,
  writePreparedPackageSource,
  type PreparedPackageSource,
  type PreparedIncludedPackageSource,
} from "./package-sources.js";
import { normalizeSkillId, SKILL_ENTRYPOINT, SKILLS_DIR } from "./shared.js";

export type {
  GitHubSkillPackageInfo,
  SkillPackageCandidate,
  SkillPackageInstallKey,
  SkillPackageInfo,
  SkillPackageInstallScope,
  SkillPackagesState,
  SkillPackageSourceKind,
  SkillPackageSourceRevisionKind,
} from "./package-state.js";

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
  scope?: SkillPackageInstallScope;
  agentId?: string;
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

export interface RemoveSkillPackageOptions {
  runtime: AppRuntime;
  id: string;
  scope?: SkillPackageInstallScope;
  agentId?: string;
}

export interface RemoveSkillPackageResult {
  id: string;
  scope: SkillPackageInstallScope;
  agentId?: string;
  removedPath: string;
  packageInfo: SkillPackageInfo;
}

export interface InstallIncludedSkillPackageOptions {
  workspacePath: string;
  source: PreparedIncludedPackageSource;
  skillId: string;
  scope: SkillPackageInstallScope;
  targetRootPath: string;
  validationAgentId: string;
  validationAgentRootPath: string;
  agentId?: string;
  force?: boolean;
  preserveExisting?: boolean;
}

export interface InstallIncludedSkillPackageResult {
  packageInfo?: SkillPackageInfo;
  created: boolean;
  existing: boolean;
  targetRootPath: string;
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
    const skillId = normalizeSkillId(opts.id ?? source.skillName);
    const target = resolveSkillPackageTarget({
      runtime: opts.runtime,
      scope: opts.scope,
      agentId: opts.scope === "agent" ? agent.id : undefined,
      validationAgentId: agent.id,
      skillId,
    });
    packages.push(await installPreparedSkillPackage({
      runtime: opts.runtime,
      source,
      skillId,
      force: opts.force,
      originalSource: opts.source,
      targetRootPath: target.rootPath,
      scope: opts.scope,
      agentId: opts.scope === "agent" ? agent.id : undefined,
      validationAgentId: target.validationAgentId,
      validationAgentRootPath: target.validationAgentRootPath,
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

export async function updateSkillPackage(
  opts: UpdateSkillPackageOptions,
): Promise<UpdateSkillPackageResult> {
  const { packageInfo: current } = selectSkillPackageInstall({
    runtime: opts.runtime,
    id: opts.id,
    scope: opts.scope,
    agentId: opts.agentId,
  });

  const latestSource = await preparePackageSourceForUpdate(current);
  return updateInstalledSkillPackage(opts, current, latestSource);
}

export function removeSkillPackage(
  opts: RemoveSkillPackageOptions,
): RemoveSkillPackageResult {
  const selected = selectSkillPackageInstall({
    runtime: opts.runtime,
    id: opts.id,
    scope: opts.scope,
    agentId: opts.agentId,
  });
  const packageInfo = selected.packageInfo;
  if (!packageInfo.scope) {
    throw new Error(`skill package install is missing assignment: ${packageInfo.id}`);
  }
  const rootPath = packageInfo.installedPath ?? packageInfo.rootPath;
  assertSafeInstalledSkillPath(opts.runtime, packageInfo, rootPath);
  rmSync(rootPath, { recursive: true, force: true });

  const state = readSkillPackagesState(opts.runtime.paths.workspace);
  delete state.packages[selected.installKey];
  writeSkillPackagesState(opts.runtime.paths.workspace, state);

  return {
    id: packageInfo.id,
    scope: packageInfo.scope,
    agentId: packageInfo.agentId,
    removedPath: rootPath,
    packageInfo,
  };
}

export function installIncludedSkillPackageCopy(
  opts: InstallIncludedSkillPackageOptions,
): InstallIncludedSkillPackageResult {
  const skillId = normalizeSkillId(opts.skillId);
  const rootPath = opts.targetRootPath;
  const entryPath = join(rootPath, SKILL_ENTRYPOINT);
  const parentPath = dirname(rootPath);
  const sourceHash = opts.source.sourceRevision ?? hashSkillPackage(opts.source.path);

  if (existsSync(rootPath) && !opts.force) {
    if (!opts.preserveExisting) {
      throw new Error(`skill package already exists: ${rootPath}`);
    }
    const installedHash = hashSkillPackage(rootPath);
    const packageInfo = writeInstalledSkillPackageInfo({
      workspacePath: opts.workspacePath,
      id: skillId,
      rootPath,
      entryPath,
      source: opts.source,
      originalSource: opts.source.source,
      sourceHash,
      scope: opts.scope,
      agentId: opts.agentId,
      installedHash,
    });
    return {
      packageInfo,
      created: false,
      existing: true,
      targetRootPath: rootPath,
    };
  }

  mkdirSync(parentPath, { recursive: true });
  const stagingPath = mkdtempSync(join(parentPath, ".tmp-"));
  const stagingEntryPath = join(stagingPath, SKILL_ENTRYPOINT);

  try {
    copySkillDirectorySafe(opts.source.path, stagingPath);
    validateCopiedSkillPackage({
      workspacePath: opts.workspacePath,
      agentId: opts.validationAgentId,
      agentRootPath: opts.validationAgentRootPath,
      entryPath: stagingEntryPath,
      skillId,
    });
    rmSync(rootPath, { recursive: true, force: true });
    renameSync(stagingPath, rootPath);
  } catch (error) {
    rmSync(stagingPath, { recursive: true, force: true });
    throw error;
  }

  const installedHash = hashSkillPackage(rootPath);
  const packageInfo = writeInstalledSkillPackageInfo({
    workspacePath: opts.workspacePath,
    id: skillId,
    rootPath,
    entryPath,
    source: opts.source,
    originalSource: opts.source.source,
    sourceHash,
    scope: opts.scope,
    agentId: opts.agentId,
    installedHash,
  });

  return {
    packageInfo,
    created: true,
    existing: false,
    targetRootPath: rootPath,
  };
}

async function installPreparedSkillPackage(opts: {
  runtime: AppRuntime;
  source: PreparedPackageSource;
  skillId: string;
  force: boolean | undefined;
  originalSource: string;
  targetRootPath: string;
  scope: SkillPackageInstallScope;
  agentId?: string;
  validationAgentId: string;
  validationAgentRootPath: string;
}): Promise<SkillPackageInfo> {
  const skillId = normalizeSkillId(opts.skillId);
  const rootPath = opts.targetRootPath;
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
      agentDir: opts.validationAgentRootPath,
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

  const installedHash = hashSkillPackage(rootPath);
  const info = writeInstalledSkillPackageInfo({
    workspacePath: opts.runtime.paths.workspace,
    id: skillId,
    rootPath,
    entryPath,
    source: opts.source,
    originalSource: opts.originalSource,
    scope: opts.scope,
    agentId: opts.agentId,
    installedHash,
  });

  return info;
}

function resolveSkillPackageTarget(opts: {
  runtime: AppRuntime;
  scope: SkillPackageInstallScope;
  skillId: string;
  agentId?: string;
  validationAgentId: string;
}): {
  rootPath: string;
  validationAgentId: string;
  validationAgentRootPath: string;
} {
  const validationAgent = opts.runtime.getAgent(opts.validationAgentId);
  if (opts.scope === "agent") {
    const targetAgent = opts.runtime.getAgent(opts.agentId);
    return {
      rootPath: join(
        opts.runtime.getAgentPaths(targetAgent.id).skillsDir,
        ...opts.skillId.split("/"),
      ),
      validationAgentId: targetAgent.id,
      validationAgentRootPath: opts.runtime.getAgentPaths(targetAgent.id).root,
    };
  }
  return {
    rootPath: join(opts.runtime.paths.workspace, SKILLS_DIR, ...opts.skillId.split("/")),
    validationAgentId: validationAgent.id,
    validationAgentRootPath: opts.runtime.getAgentPaths(validationAgent.id).root,
  };
}

async function updateInstalledSkillPackage(
  opts: UpdateSkillPackageOptions,
  current: SkillPackageInfo,
  latestSource: PreparedPackageSource,
): Promise<UpdateSkillPackageResult> {
  const latestCandidate = toSkillPackageCandidate(latestSource, current.id);
  const latestSourceHash = await hashPreparedPackageSource(latestSource);
  const latestRevision = latestSource.sourceRevision ?? latestSourceHash;
  const installedPath = current.installedPath ?? current.rootPath;
  const installedHash = existsSync(installedPath)
    ? hashSkillPackage(installedPath)
    : current.installedHash ?? current.hash;
  const currentRevision = current.sourceRevision ?? current.sourceHash ?? current.hash;
  const currentSourceHash = current.sourceHash ?? (
    current.sourceRevisionKind === "hash" ? current.sourceRevision : undefined
  ) ?? current.hash;
  const localModified = installedHash !== currentSourceHash;
  const updateAvailable = currentRevision !== latestRevision;
  const checkedAt = new Date().toISOString();
  const computedCurrent: SkillPackageInfo = {
    ...current,
    rootPath: installedPath,
    entryPath: join(installedPath, SKILL_ENTRYPOINT),
    installedPath,
    sourceHash: currentSourceHash,
    sourceRevision: currentRevision,
    installedHash,
    modified: localModified,
  };

  if (opts.dryRun || !updateAvailable) {
    return {
      id: current.id,
      dryRun: Boolean(opts.dryRun),
      updateAvailable,
      checkedAt,
      current: computedCurrent,
      latest: latestCandidate,
      reason: localModified
        ? "installed copy has local modifications"
        : updateAvailable
          ? "update available"
          : "package source is unchanged",
    };
  }

  if (localModified) {
    throw new Error(`skill package has local modifications: ${current.id}`);
  }

  const validationAgentId = current.scope === "agent" && current.agentId
    ? current.agentId
    : opts.runtime.getAgent().id;
  const validationAgent = opts.runtime.getAgent(validationAgentId);
  const packageInfo = await installPreparedSkillPackage({
    runtime: opts.runtime,
    source: latestSource,
    skillId: current.id,
    force: true,
    originalSource: current.source,
    targetRootPath: installedPath,
    scope: current.scope ?? "workspace",
    agentId: current.agentId,
    validationAgentId: validationAgent.id,
    validationAgentRootPath: opts.runtime.getAgentPaths(validationAgent.id).root,
  });

  return {
    id: current.id,
    dryRun: false,
    updateAvailable: true,
    checkedAt,
    current: computedCurrent,
    latest: latestCandidate,
    packageInfo,
    reason: "package updated",
  };
}

function writeInstalledSkillPackageInfo(opts: {
  workspacePath: string;
  id: string;
  rootPath: string;
  entryPath: string;
  source: PreparedPackageSource;
  originalSource: string;
  sourceHash?: string;
  scope: SkillPackageInstallScope;
  agentId?: string;
  installedHash: string;
}): SkillPackageInfo {
  const sourceHash = opts.sourceHash ?? opts.installedHash;
  const installKey = skillPackageInstallKey({
    id: opts.id,
    scope: opts.scope,
    agentId: opts.agentId,
  });
  const packageInfo: SkillPackageInfo = {
    installKey,
    id: opts.id,
    rootPath: opts.rootPath,
    entryPath: opts.entryPath,
    source: opts.originalSource,
    sourceKind: opts.source.kind,
    fetchedAt: new Date().toISOString(),
    hash: opts.installedHash,
    scope: opts.scope,
    agentId: opts.agentId,
    installedPath: opts.rootPath,
    sourceHash,
    installedHash: opts.installedHash,
    modified: opts.installedHash !== sourceHash,
    sourceRevision: opts.source.sourceRevision ?? sourceHash,
    sourceRevisionKind: opts.source.sourceRevisionKind ?? "hash",
    github: opts.source.kind === "github" ? opts.source.github : undefined,
  };
  const packages = readSkillPackagesState(opts.workspacePath);
  packages.packages[installKey] = packageInfo;
  writeSkillPackagesState(opts.workspacePath, packages);
  return packageInfo;
}

function selectSkillPackageInstall(opts: {
  runtime: AppRuntime;
  id: string;
  scope?: SkillPackageInstallScope;
  agentId?: string;
}): { installKey: SkillPackageInstallKey; packageInfo: SkillPackageInfo } {
  const id = normalizeSkillId(opts.id);
  const state = readSkillPackagesState(opts.runtime.paths.workspace);
  if (opts.scope) {
    const agentId = opts.scope === "agent"
      ? opts.runtime.getAgent(opts.agentId).id
      : undefined;
    const installKey = skillPackageInstallKey({ id, scope: opts.scope, agentId });
    const packageInfo = state.packages[installKey];
    if (!packageInfo) {
      const target = opts.scope === "agent" ? `agent ${agentId}` : "workspace";
      throw new Error(`skill package not found for ${target}: ${id}`);
    }
    return { installKey, packageInfo };
  }

  const matches = Object.entries(state.packages)
    .filter(([, packageInfo]) => packageInfo.id === id);
  if (matches.length === 0) {
    throw new Error(`skill package not found: ${id}`);
  }
  if (matches.length > 1) {
    throw new Error(`multiple skill package installs found for ${id}; choose --agent <id> or --workspace`);
  }
  const [installKey, packageInfo] = matches[0]!;
  return { installKey, packageInfo };
}

function assertSafeInstalledSkillPath(
  runtime: AppRuntime,
  packageInfo: SkillPackageInfo,
  rootPath: string,
): void {
  if (packageInfo.scope === "workspace") {
    const expectedRoot = join(runtime.paths.workspace, SKILLS_DIR);
    if (!isUnderPath(rootPath, expectedRoot)) {
      throw new Error(`skill package path is outside workspace skills root: ${rootPath}`);
    }
    return;
  }
  if (packageInfo.scope === "agent" && packageInfo.agentId) {
    const expectedRoot = runtime.getAgentPaths(packageInfo.agentId).skillsDir;
    if (!isUnderPath(rootPath, expectedRoot)) {
      throw new Error(`skill package path is outside agent skills root: ${rootPath}`);
    }
    return;
  }
  throw new Error(`skill package install is missing assignment: ${packageInfo.id}`);
}

function isUnderPath(target: string, root: string): boolean {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(root);
  if (resolvedTarget === resolvedRoot) return true;
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  return resolvedTarget.startsWith(prefix);
}

function validateCopiedSkillPackage(opts: {
  workspacePath: string;
  agentId: string;
  agentRootPath: string;
  entryPath: string;
  skillId: string;
}): void {
  const validation = loadSkills({
    cwd: opts.workspacePath,
    agentDir: opts.agentRootPath,
    skillPaths: [opts.entryPath],
    includeDefaults: false,
  });
  if (validation.skills.length !== 1) {
    const details = validation.diagnostics.map((diagnostic) => diagnostic.message).join("; ");
    throw new Error(`skill package did not load${details ? `: ${details}` : ""}`);
  }
  const loadedSkill = validation.skills[0]!;
  if (loadedSkill.name !== opts.skillId) {
    throw new Error(
      `skill id "${opts.skillId}" must match Pi skill name "${loadedSkill.name}"`,
    );
  }
}
