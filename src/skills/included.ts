import { join } from "node:path";
import { projectRoot } from "../app/project-root.js";
import { normalizeSkillId, SKILL_ENTRYPOINT } from "./shared.js";

export type IncludedSkillCategory = "behavior" | "shrimpy-how-to" | "system";

export type IncludedSkillAssignment =
  | { scope: "workspace" }
  | { scope: "agent"; agentId: string };

export interface IncludedSkillDefinition {
  id: string;
  category: IncludedSkillCategory;
  rootPath: string;
  entryPath: string;
  source: string;
  assignment?: IncludedSkillAssignment;
}

function includedSkill(
  id: string,
  opts: {
    category: IncludedSkillCategory;
    assignment?: IncludedSkillAssignment;
  },
): IncludedSkillDefinition {
  const skillId = normalizeSkillId(id);
  const rootPath = join(projectRoot, "src", "skills", "included", ...skillId.split("/"));
  return {
    id: skillId,
    category: opts.category,
    rootPath,
    entryPath: join(rootPath, SKILL_ENTRYPOINT),
    source: `included:${skillId}`,
    assignment: opts.assignment,
  };
}

const WORKSPACE_ASSIGNMENT = { scope: "workspace" } as const;
const MECHANIC_ASSIGNMENT = { scope: "agent", agentId: "mechanic" } as const;

const INCLUDED_SKILLS: IncludedSkillDefinition[] = [
  includedSkill("shrimpy-coding-delegation", {
    category: "system",
    assignment: WORKSPACE_ASSIGNMENT,
  }),
  includedSkill("codex-web-search", {
    category: "system",
  }),
  includedSkill("memory-management", {
    category: "behavior",
    assignment: WORKSPACE_ASSIGNMENT,
  }),
  includedSkill("remember", {
    category: "behavior",
    assignment: WORKSPACE_ASSIGNMENT,
  }),
  includedSkill("shrimpy-search", {
    category: "shrimpy-how-to",
    assignment: WORKSPACE_ASSIGNMENT,
  }),
  includedSkill("journal-daily", {
    category: "behavior",
    assignment: WORKSPACE_ASSIGNMENT,
  }),
  includedSkill("journal-compact", {
    category: "behavior",
    assignment: WORKSPACE_ASSIGNMENT,
  }),
  includedSkill("shrimpy-setup", {
    category: "shrimpy-how-to",
    assignment: MECHANIC_ASSIGNMENT,
  }),
  includedSkill("shrimpy-agents", {
    category: "shrimpy-how-to",
    assignment: WORKSPACE_ASSIGNMENT,
  }),
  includedSkill("shrimpy-channels", {
    category: "shrimpy-how-to",
    assignment: WORKSPACE_ASSIGNMENT,
  }),
  includedSkill("shrimpy-hygiene-audit", {
    category: "shrimpy-how-to",
    assignment: MECHANIC_ASSIGNMENT,
  }),
  includedSkill("shrimpy-watches", {
    category: "shrimpy-how-to",
    assignment: MECHANIC_ASSIGNMENT,
  }),
  includedSkill("shrimpy-watches-default-init", {
    category: "shrimpy-how-to",
    assignment: MECHANIC_ASSIGNMENT,
  }),
  includedSkill("shrimpy-skills", {
    category: "shrimpy-how-to",
    assignment: WORKSPACE_ASSIGNMENT,
  }),
  includedSkill("shrimpy-security-audit", {
    category: "shrimpy-how-to",
    assignment: MECHANIC_ASSIGNMENT,
  }),
  includedSkill("shrimpy-workspace-migration", {
    category: "shrimpy-how-to",
    assignment: MECHANIC_ASSIGNMENT,
  }),
];

export function listIncludedSkillDefinitions(): IncludedSkillDefinition[] {
  return [...INCLUDED_SKILLS];
}

export function listAssignedIncludedSkillDefinitions(): IncludedSkillDefinition[] {
  return INCLUDED_SKILLS.filter((definition) => definition.assignment);
}

export function getIncludedSkillDefinition(
  id: string,
): IncludedSkillDefinition | undefined {
  const skillId = normalizeSkillId(id);
  return INCLUDED_SKILLS.find((definition) => definition.id === skillId);
}
