import {
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, relative } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import type { PromptResourceRef } from "../context/index.js";

const SKILLS_DIR = "skills";
const SKILL_ENTRYPOINT = "SKILL.md";

export type SkillScope = "agent" | "workspace";

export interface SkillView {
  id: string;
  name: string;
  description: string;
  scope: SkillScope;
  agentId: string;
  rootPath: string;
  entryPath: string;
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
    skillId,
  });
}

export function listSkillViewsFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
}): SkillView[] {
  const seen = new Set<string>();
  const views: SkillView[] = [];

  for (const source of skillSources(opts)) {
    if (!existsSync(source.skillsRoot)) continue;
    for (const rootPath of walkSkillRoots(source.skillsRoot)) {
      const id = relative(source.skillsRoot, rootPath).replaceAll("\\", "/");
      if (seen.has(id)) continue;
      seen.add(id);
      views.push(createSkillView({
        id,
        agentId: opts.agentId,
        rootPath,
        scope: source.scope,
      }));
    }
  }

  return views.sort((a, b) => a.id.localeCompare(b.id));
}

export function getSkillViewFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  skillId: string;
}): SkillView {
  const normalizedSkillId = normalizeSkillId(opts.skillId);

  for (const source of skillSources(opts)) {
    const rootPath = join(
      source.skillsRoot,
      ...normalizedSkillId.split("/"),
    );
    const entryPath = join(rootPath, SKILL_ENTRYPOINT);
    if (existsSync(entryPath)) {
      return createSkillView({
        id: normalizedSkillId,
        agentId: opts.agentId,
        rootPath,
        scope: source.scope,
      });
    }
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
    rootPath: skill.scope === "agent"
      ? runtime.getAgentPaths(skill.agentId).root
      : runtime.paths.workspace,
    resourcePath: `${SKILLS_DIR}/${skill.id}`,
  }];
}

export function getSkillPromptResourcesFromPaths(opts: {
  agentId: string;
  agentRootPath: string;
  workspacePath: string;
  skillIds: string[];
}): PromptResourceRef[] {
  return opts.skillIds.map((skillId) => {
    const skill = getSkillViewFromPaths({ ...opts, skillId });
    return {
      rootPath: skill.scope === "agent" ? opts.agentRootPath : opts.workspacePath,
      resourcePath: `${SKILLS_DIR}/${skill.id}`,
    };
  });
}

function skillSources(opts: {
  agentRootPath: string;
  workspacePath: string;
}): Array<{ scope: SkillScope; skillsRoot: string }> {
  return [
    { scope: "agent", skillsRoot: join(opts.agentRootPath, SKILLS_DIR) },
    { scope: "workspace", skillsRoot: join(opts.workspacePath, SKILLS_DIR) },
  ];
}

function createSkillView(opts: {
  id: string;
  agentId: string;
  rootPath: string;
  scope: SkillScope;
}): SkillView {
  const entryPath = join(opts.rootPath, SKILL_ENTRYPOINT);
  const content = readFileSync(entryPath, "utf-8");
  const frontmatter = parseSkillFrontmatter(content);
  return {
    id: opts.id,
    name: frontmatter.name?.trim() || opts.id.split("/").at(-1) || opts.id,
    description: frontmatter.description?.trim() || firstBodySummary(content),
    scope: opts.scope,
    agentId: opts.agentId,
    rootPath: opts.rootPath,
    entryPath,
  };
}

function parseSkillFrontmatter(content: string): Record<string, string> {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---", 4);
  if (end === -1) return {};

  const frontmatter: Record<string, string> = {};
  for (const line of content.slice(4, end).split("\n")) {
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key) frontmatter[key] = value;
  }
  return frontmatter;
}

function firstBodySummary(content: string): string {
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

function normalizeSkillId(skillId: string): string {
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
    if (segment.includes("~")) {
      throw new Error(`invalid skill id: ${skillId}`);
    }
  }

  return segments.join("/");
}

function walkSkillRoots(rootPath: string): string[] {
  const roots: string[] = [];
  const entries = readdirSync(rootPath, { withFileTypes: true });

  if (entries.some((entry) => entry.isFile() && entry.name === SKILL_ENTRYPOINT)) {
    roots.push(rootPath);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    roots.push(...walkSkillRoots(join(rootPath, entry.name)));
  }

  return roots;
}
