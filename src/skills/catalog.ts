import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import {
  loadSkills,
  type ResourceDiagnostic,
  type Skill as PiSkill,
} from "@earendil-works/pi-coding-agent";
import type { PromptResourceRef } from "../context/resources.js";
import {
  readSkillPackagesState,
  type SkillPackageInfo,
} from "./packages/state.js";
import { hashSkillPackage } from "./packages/sources.js";
import {
  normalizeSkillId,
  readYamlFrontmatter,
  SKILL_ENTRYPOINT,
  SKILL_PROMPT_WARNING_THRESHOLD,
  SKILLS_DIR,
  skillNameForId,
  uniqueStrings,
} from "./shared.js";

export {
  deriveSkillIdFromSource,
  normalizeSkillId,
  SKILL_PROMPT_WARNING_THRESHOLD,
} from "./shared.js";

export type SkillScope = "agent" | "workspace";
type SkillSourceKind = "local" | "package";

export interface SkillRuntime {
  paths: { workspace: string };
  getAgent(agentId?: string): { id: string };
  getAgentPaths(agentId: string): { root: string };
  resolveAgentToolPolicy(agentId: string): { activeToolNames: string[] };
}

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

export function resolveSkillRuntimeContext(
  runtime: SkillRuntime,
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
  runtime: SkillRuntime,
  agentId?: string,
): SkillView[] {
  return inspectSkillsFromPaths(resolveSkillRuntimeContext(runtime, agentId)).skills;
}

export function getSkillView(
  runtime: SkillRuntime,
  skillId: string,
  agentId?: string,
): SkillView {
  return getSkillViewFromPaths({
    ...resolveSkillRuntimeContext(runtime, agentId),
    skillId,
  });
}

export function inspectSkills(
  runtime: SkillRuntime,
  agentId?: string,
): SkillInventory {
  return inspectSkillsFromPaths(resolveSkillRuntimeContext(runtime, agentId));
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
  runtime: SkillRuntime,
  skillId: string,
  agentId?: string,
): string {
  return readFileSync(getSkillView(runtime, skillId, agentId).entryPath, "utf-8");
}

export function getSkillPromptResources(
  runtime: SkillRuntime,
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
