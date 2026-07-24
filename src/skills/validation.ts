import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  getSkillViewFromPaths,
  inspectSkillsFromPaths,
  resolveSkillRuntimeContext,
  type SkillRuntime,
  type SkillScope,
  type SkillView,
} from "./catalog.js";
import { isUnderPath, SKILL_ENTRYPOINT, SKILLS_DIR } from "./shared.js";

export interface SkillValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  skillId?: string;
  path?: string;
}

export interface SkillValidationPackageStatus {
  installKey: string;
  id: string;
  scope: SkillScope;
  source: string;
  sourceKind: string;
  assignment?: string;
  installedPath: string;
  modified?: boolean;
}

export interface SkillValidationResult {
  agentId: string;
  issues: SkillValidationIssue[];
  packages: SkillValidationPackageStatus[];
}

export function validateSkills(
  runtime: SkillRuntime,
  opts?: {
    agentId?: string;
    skillId?: string;
  },
): SkillValidationResult {
  return validateSkillsFromPaths({
    ...resolveSkillRuntimeContext(runtime, opts?.agentId),
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

function validateSkillPathLayout(
  skill: SkillView,
  opts: {
    agentRootPath: string;
    workspacePath: string;
  },
): SkillValidationIssue[] {
  const issues: SkillValidationIssue[] = [];
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
