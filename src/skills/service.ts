import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import {
  loadSkills,
  type ResourceDiagnostic,
  type Skill as PiSkill,
} from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import type { PromptResourceRef } from "../context/index.js";
import { readJsonFile, writeJsonFileAtomic } from "../util/json-file.js";
import { listDefaultSkillDefinitions } from "./defaults.js";

const SKILLS_DIR = "skills";
const SKILL_ENTRYPOINT = "SKILL.md";
const SKILL_PACKAGES_DIR = "state/skills/packages";
const SKILL_PACKAGES_FILE = "state/skills/packages.json";
const SKILL_BINDINGS_FILE = "state/skills/bindings.json";
export const SKILL_PROMPT_WARNING_THRESHOLD = 20;

export type SkillScope = "agent" | "workspace" | "default" | "package";
export type SkillSourceKind = "local" | "default" | "package";

export type SkillValidationLevel = "error" | "warning";

export interface SkillView {
  id: string;
  name: string;
  description: string;
  scope: SkillScope;
  sourceKind: SkillSourceKind;
  agentId: string;
  rootPath: string;
  entryPath: string;
  promptRootPath: string;
  promptResourcePath: string;
  loaded: boolean;
  available: boolean;
  blockedReasons: string[];
  requiredTools: string[];
  missingTools: string[];
  disableModelInvocation: boolean;
  sourceInfo?: PiSkill["sourceInfo"];
  diagnostics: ResourceDiagnostic[];
  nameMismatch: boolean;
  packageInfo?: SkillPackageInfo;
}

export interface ShadowedSkillView {
  id: string;
  scope: SkillScope;
  sourceKind: SkillSourceKind;
  rootPath: string;
  entryPath: string;
  shadowedBy: {
    scope: SkillScope;
    sourceKind: SkillSourceKind;
    rootPath: string;
    entryPath: string;
  };
}

export interface SkillInventory {
  agentId: string;
  skills: SkillView[];
  shadowedSkills: ShadowedSkillView[];
  diagnostics: ResourceDiagnostic[];
  warnings: string[];
  promptWarningThreshold: number;
}

export interface SkillValidationIssue {
  level: SkillValidationLevel;
  code: string;
  message: string;
  skillId?: string;
  path?: string;
}

export interface SkillValidationResult {
  agentId: string;
  issues: SkillValidationIssue[];
}

interface ScannedSkillEntry {
  id: string;
  agentId: string;
  scope: SkillScope;
  sourceKind: SkillSourceKind;
  rootPath: string;
  entryPath: string;
  promptRootPath: string;
  promptResourcePath: string;
  packageInfo?: SkillPackageInfo;
}

export type SkillPackageSourceKind = "local-directory" | "local-file" | "url";

export interface SkillPackageInfo {
  id: string;
  rootPath: string;
  entryPath: string;
  source: string;
  sourceKind: SkillPackageSourceKind;
  fetchedAt: string;
  hash: string;
}

export interface SkillPackagesState {
  packages: Record<string, SkillPackageInfo>;
}

export interface SkillBindingsState {
  workspace: string[];
  agents: Record<string, string[]>;
}

export interface AddSkillPackageOptions {
  runtime: AppRuntime;
  source: string;
  scope: "agent" | "workspace";
  agentId?: string;
  id?: string;
  force?: boolean;
}

export function listSkillViews(
  runtime: AppRuntime,
  agentId?: string,
): SkillView[] {
  const agent = runtime.getAgent(agentId);
  return listSkillViewsFromPaths({
    agentId: agent.id,
    agentRootPath: runtime.getAgentPaths(agent.id).root,
    workspacePath: runtime.paths.workspace,
    activeToolNames: runtime.resolveAgentToolPolicy(agent.id).activeToolNames,
  });
}

export function getSkillView(
  runtime: AppRuntime,
  skillId: string,
  agentId?: string,
): SkillView {
  const agent = runtime.getAgent(agentId);
  return getSkillViewFromPaths({
    agentId: agent.id,
    agentRootPath: runtime.getAgentPaths(agent.id).root,
    workspacePath: runtime.paths.workspace,
    activeToolNames: runtime.resolveAgentToolPolicy(agent.id).activeToolNames,
    skillId,
  });
}

export function listSkillViewsFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  activeToolNames?: string[];
}): SkillView[] {
  return inspectSkillsFromPaths(opts).skills;
}

export function inspectSkills(
  runtime: AppRuntime,
  agentId?: string,
): SkillInventory {
  const agent = runtime.getAgent(agentId);
  return inspectSkillsFromPaths({
    agentId: agent.id,
    agentRootPath: runtime.getAgentPaths(agent.id).root,
    workspacePath: runtime.paths.workspace,
    activeToolNames: runtime.resolveAgentToolPolicy(agent.id).activeToolNames,
  });
}

export function inspectSkillsFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  activeToolNames?: string[];
}): SkillInventory {
  const scan = scanSkillEntries(opts);
  const loaded = loadPiSkillsForEntries(opts, scan.entries);
  const diagnosticsByPath = groupDiagnosticsByPath(loaded.diagnostics);
  const skills = scan.entries.map((entry) =>
    createSkillView({
      entry,
      piSkill: loaded.skillsByPath.get(resolve(entry.entryPath)),
      diagnostics: diagnosticsByPath.get(resolve(entry.entryPath)) ?? [],
      activeToolNames: opts.activeToolNames,
    })
  ).sort(compareSkillViews);
  const warnings = largeSkillSetWarnings(skills);

  return {
    agentId: opts.agentId,
    skills,
    shadowedSkills: scan.shadowedSkills.sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics: loaded.diagnostics,
    warnings,
    promptWarningThreshold: SKILL_PROMPT_WARNING_THRESHOLD,
  };
}

export function getSkillViewFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  activeToolNames?: string[];
  skillId: string;
}): SkillView {
  const normalizedSkillId = normalizeSkillId(opts.skillId);
  const inventory = inspectSkillsFromPaths(opts);
  const byId = inventory.skills.find((skill) => skill.id === normalizedSkillId);
  if (byId) return byId;
  const byName = inventory.skills.filter((skill) => skill.name === normalizedSkillId);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) {
    throw new Error(
      `ambiguous skill name: ${opts.agentId}/${normalizedSkillId}`,
    );
  }
  throw new Error(`skill not found: ${opts.agentId}/${normalizedSkillId}`);
}

export function loadSkillPrompt(
  runtime: AppRuntime,
  skillId: string,
  agentId?: string,
): string {
  return readFileSync(getSkillView(runtime, skillId, agentId).entryPath, "utf-8");
}

export function loadSkillPromptFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  activeToolNames?: string[];
  skillId: string;
}): string {
  return readFileSync(getSkillViewFromPaths(opts).entryPath, "utf-8");
}

export function getSkillPromptResources(
  runtime: AppRuntime,
  skillId: string,
  agentId?: string,
): PromptResourceRef[] {
  const skill = getSkillView(runtime, skillId, agentId);
  return [{
    rootPath: skill.promptRootPath,
    resourcePath: skill.promptResourcePath,
  }];
}

export function getSkillPromptResourcesFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  activeToolNames?: string[];
  skillIds: string[];
}): PromptResourceRef[] {
  return opts.skillIds.map((skillId) => {
    const skill = getSkillViewFromPaths({ ...opts, skillId });
    return {
      rootPath: skill.promptRootPath,
      resourcePath: skill.promptResourcePath,
    };
  });
}

export function listEffectiveSkillEntryPathsFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  activeToolNames?: string[];
}): string[] {
  return inspectSkillsFromPaths(opts).skills
    .filter((skill) => skill.available)
    .map((skill) => skill.entryPath);
}

export function validateSkills(
  runtime: AppRuntime,
  opts?: {
    agentId?: string;
    skillId?: string;
  },
): SkillValidationResult {
  const agent = runtime.getAgent(opts?.agentId);
  return validateSkillsFromPaths({
    agentId: agent.id,
    agentRootPath: runtime.getAgentPaths(agent.id).root,
    workspacePath: runtime.paths.workspace,
    activeToolNames: runtime.resolveAgentToolPolicy(agent.id).activeToolNames,
    skillId: opts?.skillId,
  });
}

export function validateSkillsFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  activeToolNames?: string[];
  skillId?: string;
}): SkillValidationResult {
  const inventory = inspectSkillsFromPaths(opts);
  const skills = opts.skillId
    ? [getSkillViewFromPaths({ ...opts, skillId: opts.skillId })]
    : inventory.skills;
  const issues: SkillValidationIssue[] = [];

  if (!opts.skillId) {
    for (const warning of inventory.warnings) {
      issues.push({
        level: "warning",
        code: "large-effective-skill-set",
        message: warning,
      });
    }
  }

  for (const skill of skills) {
    for (const diagnostic of skill.diagnostics) {
      issues.push({
        level: diagnostic.type === "error" ? "error" : "warning",
        code: diagnostic.type,
        message: diagnostic.message,
        path: diagnostic.path,
        skillId: skill.id,
      });
    }
    if (!skill.loaded) {
      issues.push({
        level: "error",
        code: "not-loaded-by-pi",
        message:
          "Pi did not load this skill. Check required YAML frontmatter, especially description.",
        path: skill.entryPath,
        skillId: skill.id,
      });
    }
    if (skill.nameMismatch) {
      issues.push({
        level: "error",
        code: "name-id-mismatch",
        message:
          `skill id "${skill.id}" must match Pi skill name "${skill.name}"`,
        path: skill.entryPath,
        skillId: skill.id,
      });
    }
    if (!skill.available) {
      issues.push({
        level: "warning",
        code: "skill-unavailable",
        message: skill.blockedReasons.join("; "),
        path: skill.entryPath,
        skillId: skill.id,
      });
    }
    issues.push(...validateSkillPathLayout(skill, opts));
  }

  if (!opts.skillId) {
    for (const shadowed of inventory.shadowedSkills) {
      issues.push({
        level: "warning",
        code: "shadowed-skill",
        message:
          `skill "${shadowed.id}" at ${shadowed.entryPath} is shadowed by ${shadowed.shadowedBy.scope} skill ${shadowed.shadowedBy.entryPath}`,
        path: shadowed.entryPath,
        skillId: shadowed.id,
      });
    }
  }

  return {
    agentId: opts.agentId,
    issues,
  };
}

export function scaffoldSkill(opts: {
  runtime: AppRuntime;
  id: string;
  scope: "agent" | "workspace";
  agentId?: string;
  description?: string;
  force?: boolean;
}): SkillView {
  const target = resolveSkillTarget(opts.runtime, opts.scope, opts.agentId);
  const skillId = normalizeSkillId(opts.id);
  const rootPath = join(target.skillsRoot, ...skillId.split("/"));
  const entryPath = join(rootPath, SKILL_ENTRYPOINT);

  if (existsSync(rootPath) && !opts.force) {
    throw new Error(`skill already exists: ${rootPath}`);
  }

  mkdirSync(rootPath, { recursive: true });
  if (existsSync(entryPath) && !opts.force) {
    throw new Error(`skill already exists: ${entryPath}`);
  }

  const name = skillNameForId(skillId);
  const description = opts.description?.trim() || `Use for ${name} tasks.`;
  writeFileSync(
    entryPath,
    [
      "---",
      `name: ${name}`,
      `description: ${quoteYamlString(description)}`,
      "---",
      "",
      `# ${titleFromSkillName(name)}`,
      "",
      "Describe when to use this skill and the concrete workflow to follow.",
      "",
    ].join("\n"),
    "utf-8",
  );

  return getSkillView(opts.runtime, skillId, target.agentId);
}

function skillSources(opts: {
  agentRootPath: string;
  workspacePath: string;
}): Array<{ scope: "agent" | "workspace"; skillsRoot: string; promptRootPath: string }> {
  return [
    {
      scope: "agent",
      skillsRoot: join(opts.agentRootPath, SKILLS_DIR),
      promptRootPath: opts.agentRootPath,
    },
    {
      scope: "workspace",
      skillsRoot: join(opts.workspacePath, SKILLS_DIR),
      promptRootPath: opts.workspacePath,
    },
  ];
}

function scanSkillEntries(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
}): { entries: ScannedSkillEntry[]; shadowedSkills: ShadowedSkillView[] } {
  const seen = new Map<string, ScannedSkillEntry>();
  const entries: ScannedSkillEntry[] = [];
  const shadowedSkills: ShadowedSkillView[] = [];

  for (const source of skillSources(opts)) {
    for (const rootPath of walkSkillRoots(source.skillsRoot, source.skillsRoot)) {
      const id = normalizeSkillId(
        relative(source.skillsRoot, rootPath).replaceAll("\\", "/"),
      );
      addScannedEntry({
        id,
        agentId: opts.agentId,
        scope: source.scope,
        sourceKind: "local",
        rootPath,
        entryPath: join(rootPath, SKILL_ENTRYPOINT),
        promptRootPath: source.promptRootPath,
        promptResourcePath: `${SKILLS_DIR}/${id}`,
      }, seen, entries, shadowedSkills);
    }
  }

  for (const entry of packageBindingEntries(opts)) {
    addScannedEntry(entry, seen, entries, shadowedSkills);
  }

  for (const definition of listDefaultSkillDefinitions(opts.agentId)) {
    addScannedEntry({
      id: definition.id,
      agentId: opts.agentId,
      scope: "default",
      sourceKind: "default",
      rootPath: definition.rootPath,
      entryPath: definition.entryPath,
      promptRootPath: definition.promptRootPath,
      promptResourcePath: definition.promptResourcePath,
    }, seen, entries, shadowedSkills);
  }

  return { entries, shadowedSkills };
}

function addScannedEntry(
  entry: ScannedSkillEntry,
  seen: Map<string, ScannedSkillEntry>,
  entries: ScannedSkillEntry[],
  shadowedSkills: ShadowedSkillView[],
): void {
  const winner = seen.get(entry.id);
  if (winner) {
    shadowedSkills.push({
      id: entry.id,
      scope: entry.scope,
      sourceKind: entry.sourceKind,
      rootPath: entry.rootPath,
      entryPath: entry.entryPath,
      shadowedBy: {
        scope: winner.scope,
        sourceKind: winner.sourceKind,
        rootPath: winner.rootPath,
        entryPath: winner.entryPath,
      },
    });
    return;
  }
  seen.set(entry.id, entry);
  entries.push(entry);
}

function packageBindingEntries(opts: {
  agentId: string;
  workspacePath: string;
}): ScannedSkillEntry[] {
  const packages = readSkillPackagesState(opts.workspacePath).packages;
  const bindings = readSkillBindingsState(opts.workspacePath);
  const ids = uniqueStrings([
    ...(bindings.agents[opts.agentId] ?? []),
    ...bindings.workspace,
  ]);
  return ids.flatMap((id): ScannedSkillEntry[] => {
    const packageInfo = packages[id];
    if (!packageInfo) return [];
    return [{
      id,
      agentId: opts.agentId,
      scope: "package",
      sourceKind: "package",
      rootPath: packageInfo.rootPath,
      entryPath: packageInfo.entryPath,
      promptRootPath: packageInfo.rootPath,
      promptResourcePath: SKILL_ENTRYPOINT,
      packageInfo,
    }];
  });
}

function createSkillView(opts: {
  entry: ScannedSkillEntry;
  piSkill: PiSkill | undefined;
  diagnostics: ResourceDiagnostic[];
  activeToolNames?: string[];
}): SkillView {
  const { entry, piSkill } = opts;
  const requiredTools = readSkillRequiredTools(entry.entryPath);
  const missingTools = missingRequiredTools(requiredTools, opts.activeToolNames);
  const loaded = Boolean(piSkill);
  const blockedReasons = [
    ...(!loaded ? ["Pi did not load this skill."] : []),
    ...(missingTools.length > 0
      ? [`missing required tools: ${missingTools.join(", ")}`]
      : []),
  ];

  return {
    id: entry.id,
    name: piSkill?.name ?? skillNameForId(entry.id),
    description: piSkill?.description ?? firstBodySummary(entry.entryPath),
    scope: entry.scope,
    sourceKind: entry.sourceKind,
    agentId: entry.agentId,
    rootPath: entry.rootPath,
    entryPath: entry.entryPath,
    promptRootPath: entry.promptRootPath,
    promptResourcePath: entry.promptResourcePath,
    loaded,
    available: blockedReasons.length === 0,
    blockedReasons,
    requiredTools,
    missingTools,
    disableModelInvocation: piSkill?.disableModelInvocation ?? false,
    sourceInfo: piSkill?.sourceInfo,
    diagnostics: opts.diagnostics,
    nameMismatch: Boolean(piSkill && piSkill.name !== entry.id),
    packageInfo: entry.packageInfo,
  };
}

function loadPiSkillsForEntries(
  opts: {
    agentRootPath: string;
    workspacePath: string;
  },
  entries: ScannedSkillEntry[],
): {
  skillsByPath: Map<string, PiSkill>;
  diagnostics: ResourceDiagnostic[];
} {
  const result = loadSkills({
    cwd: opts.workspacePath,
    agentDir: opts.agentRootPath,
    skillPaths: entries.map((entry) => entry.entryPath),
    includeDefaults: false,
  });
  const skillsByPath = new Map<string, PiSkill>();
  for (const skill of result.skills) {
    skillsByPath.set(resolve(skill.filePath), skill);
  }
  return {
    skillsByPath,
    diagnostics: result.diagnostics,
  };
}

function groupDiagnosticsByPath(
  diagnostics: ResourceDiagnostic[],
): Map<string, ResourceDiagnostic[]> {
  const grouped = new Map<string, ResourceDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    if (!diagnostic.path) continue;
    const key = resolve(diagnostic.path);
    const bucket = grouped.get(key) ?? [];
    bucket.push(diagnostic);
    grouped.set(key, bucket);
  }
  return grouped;
}

function firstBodySummary(entryPath: string): string {
  if (!existsSync(entryPath)) return "";
  const content = readFileSync(entryPath, "utf-8");
  let body = content;
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---", 4);
    if (end !== -1) body = content.slice(end + 4);
  }
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    return trimmed.slice(0, 240);
  }
  return "";
}

export function normalizeSkillId(skillId: string): string {
  if (skillId.startsWith("/") || skillId.includes("\\") || skillId.includes("\0")) {
    throw new Error(`invalid skill id: ${skillId}`);
  }
  const segments = skillId
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error("skill id is required");
  }

  for (const segment of segments) {
    if (segment === "." || segment === "..") {
      throw new Error(`invalid skill id: ${skillId}`);
    }
    if (segment.includes("~") || segment.includes(":")) {
      throw new Error(`invalid skill id: ${skillId}`);
    }
  }

  return segments.join("/");
}

function skillNameForId(skillId: string): string {
  return skillId.split("/").at(-1) || skillId;
}

function compareSkillViews(a: SkillView, b: SkillView): number {
  return a.id.localeCompare(b.id) || a.scope.localeCompare(b.scope);
}

function walkSkillRoots(rootPath: string, scanRootPath = rootPath): string[] {
  if (!existsSync(rootPath)) return [];
  const roots: string[] = [];
  const entries = readdirSync(rootPath, { withFileTypes: true });

  if (entries.some((entry) => entry.isFile() && entry.name === SKILL_ENTRYPOINT)) {
    roots.push(rootPath);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (rootPath === scanRootPath && ["packages", "custom"].includes(entry.name)) {
      continue;
    }
    roots.push(...walkSkillRoots(join(rootPath, entry.name), scanRootPath));
  }

  return roots;
}

function largeSkillSetWarnings(skills: SkillView[]): string[] {
  const visibleCount = skills.filter((skill) =>
    skill.available && !skill.disableModelInvocation
  ).length;
  if (visibleCount <= SKILL_PROMPT_WARNING_THRESHOLD) return [];
  return [
    `${visibleCount} effective skills will be advertised to Pi; consider pruning unused skills if prompt context gets noisy.`,
  ];
}

function validateSkillPathLayout(
  skill: SkillView,
  opts: {
    agentRootPath: string;
    workspacePath: string;
  },
): SkillValidationIssue[] {
  const issues: SkillValidationIssue[] = [];
  if (skill.scope !== "agent" && skill.scope !== "workspace") {
    return issues;
  }
  const expectedRoot = skill.scope === "agent"
    ? join(opts.agentRootPath, SKILLS_DIR)
    : join(opts.workspacePath, SKILLS_DIR);
  if (!isUnderPath(skill.rootPath, expectedRoot)) {
    issues.push({
      level: "error",
      code: "unsafe-path",
      message: `skill path is outside expected ${skill.scope} skills root`,
      path: skill.rootPath,
      skillId: skill.id,
    });
  }

  const entryPath = join(skill.rootPath, SKILL_ENTRYPOINT);
  if (!existsSync(entryPath)) {
    issues.push({
      level: "error",
      code: "missing-entrypoint",
      message: "missing SKILL.md",
      path: entryPath,
      skillId: skill.id,
    });
  }

  for (const name of ["scripts", "references", "assets"]) {
    const path = join(skill.rootPath, name);
    if (existsSync(path) && !statSync(path).isDirectory()) {
      issues.push({
        level: "error",
        code: "invalid-layout",
        message: `${name}/ must be a directory when present`,
        path,
        skillId: skill.id,
      });
    }
  }

  return issues;
}

function isUnderPath(target: string, root: string): boolean {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(root);
  if (resolvedTarget === resolvedRoot) return true;
  const prefix = resolvedRoot.endsWith(sep) ? resolvedRoot : `${resolvedRoot}${sep}`;
  return resolvedTarget.startsWith(prefix);
}

function resolveSkillTarget(
  runtime: AppRuntime,
  scope: "agent" | "workspace",
  agentId?: string,
): { agentId: string; skillsRoot: string } {
  const agent = runtime.getAgent(agentId);
  return {
    agentId: agent.id,
    skillsRoot: scope === "agent"
      ? runtime.getAgentPaths(agent.id).skillsDir
      : join(runtime.paths.workspace, SKILLS_DIR),
  };
}

export async function addSkillPackage(
  opts: AddSkillPackageOptions,
): Promise<SkillPackageInfo> {
  const agent = opts.runtime.getAgent(opts.agentId);
  const packageSource = await preparePackageSource(opts.source);
  const skillId = normalizeSkillId(opts.id ?? packageSource.skillName);
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
    if (packageSource.kind === "local-directory") {
      cpSync(packageSource.path, stagingPath, { recursive: true, force: false });
    } else {
      writeFileSync(stagingEntryPath, packageSource.content, "utf-8");
    }

    const validation = loadSkills({
      cwd: opts.runtime.paths.workspace,
      agentDir: opts.runtime.getAgentPaths(agent.id).root,
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
    source: opts.source,
    sourceKind: packageSource.kind,
    fetchedAt: new Date().toISOString(),
    hash: hashSkillPackage(rootPath),
  };

  const packages = readSkillPackagesState(opts.runtime.paths.workspace);
  packages.packages[skillId] = info;
  writeSkillPackagesState(opts.runtime.paths.workspace, packages);
  bindSkillPackage(opts.runtime.paths.workspace, {
    id: skillId,
    scope: opts.scope,
    agentId: agent.id,
  });

  return info;
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

function skillPackageRootPath(workspacePath: string, skillId: string): string {
  return join(workspacePath, SKILL_PACKAGES_DIR, ...skillId.split("/"));
}

function skillPackagesStatePath(workspacePath: string): string {
  return join(workspacePath, SKILL_PACKAGES_FILE);
}

function skillBindingsStatePath(workspacePath: string): string {
  return join(workspacePath, SKILL_BINDINGS_FILE);
}

function readSkillPackagesState(workspacePath: string): SkillPackagesState {
  return readJsonFile(
    skillPackagesStatePath(workspacePath),
    () => ({ packages: {} }),
    (raw) => parseSkillPackagesState(raw),
  );
}

function writeSkillPackagesState(
  workspacePath: string,
  state: SkillPackagesState,
): void {
  writeJsonFileAtomic(skillPackagesStatePath(workspacePath), state);
}

function readSkillBindingsState(workspacePath: string): SkillBindingsState {
  return readJsonFile(
    skillBindingsStatePath(workspacePath),
    () => ({ workspace: [], agents: {} }),
    (raw) => parseSkillBindingsState(raw),
  );
}

function writeSkillBindingsState(
  workspacePath: string,
  state: SkillBindingsState,
): void {
  writeJsonFileAtomic(skillBindingsStatePath(workspacePath), state);
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
    packages[normalizeSkillId(id)] = candidate as unknown as SkillPackageInfo;
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

async function preparePackageSource(source: string): Promise<
  | { kind: "local-directory"; path: string; skillName: string }
  | { kind: "local-file"; content: string; skillName: string }
  | { kind: "url"; content: string; skillName: string }
> {
  if (isHttpUrl(source)) {
    const content = await fetchSkillUrl(source);
    return {
      kind: "url",
      content,
      skillName: readSkillNameFromContent(content) ?? deriveSkillIdFromUrl(source),
    };
  }

  const sourcePath = resolve(process.cwd(), source);
  if (!existsSync(sourcePath)) {
    throw new Error(`skill source does not exist: ${sourcePath}`);
  }
  const sourceStats = statSync(sourcePath);
  if (sourceStats.isDirectory()) {
    const entryPath = join(sourcePath, SKILL_ENTRYPOINT);
    if (!existsSync(entryPath)) {
      throw new Error(`skill directory is missing SKILL.md: ${sourcePath}`);
    }
    return {
      kind: "local-directory",
      path: sourcePath,
      skillName: readSkillNameFromContent(readFileSync(entryPath, "utf-8")) ??
        deriveSkillIdFromSource(sourcePath),
    };
  }
  if (!sourceStats.isFile() || !sourcePath.endsWith(".md")) {
    throw new Error(`skill source must be a directory, Markdown file, or URL: ${sourcePath}`);
  }
  const content = readFileSync(sourcePath, "utf-8");
  return {
    kind: "local-file",
    content,
    skillName: readSkillNameFromContent(content) ?? deriveSkillIdFromSource(sourcePath),
  };
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function fetchSkillUrl(source: string): Promise<string> {
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`failed to fetch skill URL ${source}: ${response.status} ${response.statusText}`);
  }
  const content = await response.text();
  if (!content.trimStart().startsWith("---")) {
    throw new Error(`skill URL did not return a SKILL.md document: ${source}`);
  }
  return content;
}

function hashSkillPackage(rootPath: string): string {
  const hash = createHash("sha256");
  for (const filePath of walkPackageFiles(rootPath)) {
    hash.update(relative(rootPath, filePath).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(filePath));
    hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function walkPackageFiles(rootPath: string): string[] {
  if (!existsSync(rootPath)) return [];
  const entries = readdirSync(rootPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    const path = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkPackageFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort();
}

function readSkillRequiredTools(entryPath: string): string[] {
  const content = existsSync(entryPath) ? readFileSync(entryPath, "utf-8") : "";
  const frontmatter = readYamlFrontmatter(content);
  const rawAllowedTools = frontmatter.get("allowed-tools");
  if (!rawAllowedTools) return [];
  return uniqueStrings(rawAllowedTools.split(/\s+/).map(normalizeToolToken).filter(Boolean));
}

function missingRequiredTools(
  requiredTools: string[],
  activeToolNames?: string[],
): string[] {
  if (requiredTools.length === 0) return [];
  const active = new Set(activeToolNames ?? []);
  return requiredTools.filter((tool) => !active.has(tool));
}

function normalizeToolToken(token: string): string {
  const name = token.trim().replace(/\(.+$/, "");
  const lower = name.toLowerCase();
  if (lower === "read") return "read";
  if (lower === "write") return "write";
  if (lower === "edit") return "edit";
  if (lower === "bash") return "bash";
  if (lower === "grep") return "grep";
  if (lower === "find") return "find";
  if (lower === "ls") return "ls";
  return lower.replace(/[^a-z0-9_-]/g, "");
}

function readSkillNameFromContent(content: string): string | undefined {
  return readYamlFrontmatter(content).get("name");
}

function readYamlFrontmatter(content: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!content.startsWith("---\n")) return result;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return result;
  const lines = content.slice(4, end).split(/\r?\n/);
  for (const line of lines) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1]!;
    let value = match[2]!.trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) result.set(key, value);
  }
  return result;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function quoteYamlString(value: string): string {
  return JSON.stringify(value);
}

function titleFromSkillName(name: string): string {
  return name
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function deriveSkillIdFromSource(sourcePath: string): string {
  const resolved = resolve(sourcePath);
  const name = existsSync(resolved) && statSync(resolved).isDirectory()
    ? basename(resolved)
    : basename(resolved) === SKILL_ENTRYPOINT
      ? basename(dirname(resolved))
      : basename(resolved).replace(/\.[^.]+$/, "");
  return normalizeSkillId(name);
}

function deriveSkillIdFromUrl(source: string): string {
  const url = new URL(source);
  const segments = url.pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1) ?? "";
  const name = lastSegment === SKILL_ENTRYPOINT
    ? segments.at(-2)
    : lastSegment.replace(/\.[^.]+$/, "");
  if (!name) {
    throw new Error(`skill URL does not include a usable skill name: ${source}`);
  }
  return normalizeSkillId(decodeURIComponent(name));
}
