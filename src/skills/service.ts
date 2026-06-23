import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  loadSkills,
  type ResourceDiagnostic,
  type Skill as PiSkill,
} from "@earendil-works/pi-coding-agent";
import type { AppRuntime } from "../app/runtime.js";
import type { PromptResourceRef } from "../context/index.js";
import {
  readSkillPackagesState,
  type SkillPackageInfo,
} from "./package-state.js";
import { hashSkillPackage } from "./package-sources.js";
import {
  isUnderPath,
  normalizeSkillId,
  quoteYamlString,
  readYamlFrontmatter,
  SKILL_ENTRYPOINT,
  SKILL_PROMPT_WARNING_THRESHOLD,
  SKILLS_DIR,
  skillNameForId,
  titleFromSkillName,
  uniqueStrings,
} from "./shared.js";

export {
  addSkillPackage,
  removeSkillPackage,
  updateSkillPackage,
  type AddSkillPackageOptions,
  type AddSkillPackageResult,
  type GitHubSkillPackageInfo,
  type RemoveSkillPackageOptions,
  type RemoveSkillPackageResult,
  type SkillPackageCandidate,
  type SkillPackageInstallKey,
  type SkillPackageInfo,
  type SkillPackagesState,
  type SkillPackageSourceKind,
  type SkillPackageSourceRevisionKind,
  type UpdateSkillPackageOptions,
  type UpdateSkillPackageResult,
} from "./packages.js";
export {
  deriveSkillIdFromSource,
  normalizeSkillId,
  SKILL_PROMPT_WARNING_THRESHOLD,
} from "./shared.js";

type SkillScope = "agent" | "workspace";
type SkillSourceKind = "local" | "package";

type SkillValidationLevel = "error" | "warning";

interface SkillView {
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

interface ShadowedSkillView {
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

interface SkillInventory {
  agentId: string;
  skills: SkillView[];
  shadowedSkills: ShadowedSkillView[];
  diagnostics: ResourceDiagnostic[];
  warnings: string[];
  promptWarningThreshold: number;
}

interface SkillValidationIssue {
  level: SkillValidationLevel;
  code: string;
  message: string;
  skillId?: string;
  path?: string;
}

interface SkillValidationPackageStatus {
  installKey: string;
  id: string;
  scope: SkillScope;
  source: string;
  sourceKind: string;
  assignment?: string;
  installedPath: string;
  modified?: boolean;
}

interface SkillValidationResult {
  agentId: string;
  issues: SkillValidationIssue[];
  packages: SkillValidationPackageStatus[];
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

function skillRuntimeContext(
  runtime: AppRuntime,
  agentId?: string,
): {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  activeToolNames: string[];
} {
  const agent = runtime.getAgent(agentId);
  return {
    agentId: agent.id,
    agentRootPath: runtime.getAgentPaths(agent.id).root,
    workspacePath: runtime.paths.workspace,
    activeToolNames: runtime.resolveAgentToolPolicy(agent.id).activeToolNames,
  };
}

export function listSkillViews(
  runtime: AppRuntime,
  agentId?: string,
): SkillView[] {
  return inspectSkillsFromPaths(skillRuntimeContext(runtime, agentId)).skills;
}

export function getSkillView(
  runtime: AppRuntime,
  skillId: string,
  agentId?: string,
): SkillView {
  return getSkillViewFromPaths({
    ...skillRuntimeContext(runtime, agentId),
    skillId,
  });
}

export function inspectSkills(
  runtime: AppRuntime,
  agentId?: string,
): SkillInventory {
  return inspectSkillsFromPaths(skillRuntimeContext(runtime, agentId));
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
  return validateSkillsFromPaths({
    ...skillRuntimeContext(runtime, opts?.agentId),
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
    packages: skillValidationPackageStatuses(skills),
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
  const packagesByRootPath = packageInfoByRootPath(opts.workspacePath);

  for (const source of skillSources(opts)) {
    for (const rootPath of walkSkillRoots(source.skillsRoot, source.skillsRoot)) {
      const id = normalizeSkillId(
        relative(source.skillsRoot, rootPath).replaceAll("\\", "/"),
      );
      const packageInfo = packagesByRootPath.get(resolve(rootPath));
      addScannedEntry({
        id,
        agentId: opts.agentId,
        scope: source.scope,
        sourceKind: packageInfo ? "package" : "local",
        rootPath,
        entryPath: join(rootPath, SKILL_ENTRYPOINT),
        promptRootPath: source.promptRootPath,
        promptResourcePath: `${SKILLS_DIR}/${id}`,
        packageInfo,
      }, seen, entries, shadowedSkills);
    }
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

function packageInfoByRootPath(workspacePath: string): Map<string, SkillPackageInfo> {
  const packages = readSkillPackagesState(workspacePath).packages;
  const byRootPath = new Map<string, SkillPackageInfo>();
  for (const packageInfo of Object.values(packages)) {
    const currentPackageInfo = packageInfoWithComputedStatus(packageInfo);
    byRootPath.set(resolve(currentPackageInfo.rootPath), currentPackageInfo);
  }
  return byRootPath;
}

function packageInfoWithComputedStatus(packageInfo: SkillPackageInfo): SkillPackageInfo {
  const rootPath = packageInfo.installedPath ?? packageInfo.rootPath;
  const installedHash = existsSync(rootPath)
    ? hashSkillPackage(rootPath)
    : packageInfo.installedHash ?? packageInfo.hash;
  const sourceHash = packageInfo.sourceHash ?? (
    packageInfo.sourceRevisionKind === "hash" ? packageInfo.sourceRevision : undefined
  );
  return {
    ...packageInfo,
    rootPath,
    entryPath: join(rootPath, SKILL_ENTRYPOINT),
    installedPath: rootPath,
    sourceHash,
    installedHash,
    modified: sourceHash ? installedHash !== sourceHash : packageInfo.modified,
  };
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

function skillValidationPackageStatuses(
  skills: SkillView[],
): SkillValidationPackageStatus[] {
  return skills
    .filter((skill) => skill.packageInfo)
    .map((skill) => {
      const packageInfo = skill.packageInfo!;
      const assignment = packageInfo.scope
        ? packageInfo.scope === "agent"
          ? `agent ${packageInfo.agentId ?? skill.agentId}`
          : "workspace"
        : undefined;
      return {
        installKey: packageInfo.installKey,
        id: skill.id,
        scope: skill.scope,
        source: packageInfo.source,
        sourceKind: packageInfo.sourceKind,
        assignment,
        installedPath: packageInfo.installedPath ?? packageInfo.rootPath,
        modified: packageInfo.modified,
      };
    });
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

function readSkillRequiredTools(entryPath: string): string[] {
  const content = existsSync(entryPath) ? readFileSync(entryPath, "utf-8") : "";
  const frontmatter = readYamlFrontmatter(content);
  const rawAllowedTools = frontmatter.get("allowed-tools");
  if (!rawAllowedTools) return [];
  return uniqueStrings(splitAllowedToolSpecs(rawAllowedTools).map(normalizeToolToken).filter(Boolean));
}

function missingRequiredTools(
  requiredTools: string[],
  activeToolNames?: string[],
): string[] {
  if (requiredTools.length === 0) return [];
  const active = new Set(activeToolNames ?? []);
  return requiredTools.filter((tool) => !active.has(tool));
}

function splitAllowedToolSpecs(rawAllowedTools: string): string[] {
  const specs: string[] = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < rawAllowedTools.length; index += 1) {
    const char = rawAllowedTools[index]!;
    if (char === "(") {
      depth += 1;
      continue;
    }
    if (char === ")" && depth > 0) {
      depth -= 1;
      continue;
    }
    if (depth === 0 && (char === "," || /\s/.test(char))) {
      const spec = rawAllowedTools.slice(start, index).trim();
      if (spec) specs.push(spec);
      start = index + 1;
    }
  }

  const spec = rawAllowedTools.slice(start).trim();
  if (spec) specs.push(spec);
  return specs;
}

function normalizeToolToken(token: string): string {
  const name = token.trim().replace(/\(.*$/, "");
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
