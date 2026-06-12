import { dirname, join } from "node:path";
import { projectRoot } from "../app/project-root.js";

type DefaultSkillTarget =
  | { kind: "all" }
  | { kind: "agents"; agentIds: string[] };

interface DefaultSkillDefinition {
  id: string;
  rootPath: string;
  entryPath: string;
  promptRootPath: string;
  promptResourcePath: string;
  target: DefaultSkillTarget;
}

function setupTemplatePath(...segments: string[]): string {
  return join(projectRoot, "src", "setup", "templates", ...segments);
}

function defaultSkill(
  id: string,
  rootPath: string,
  target: DefaultSkillTarget,
): DefaultSkillDefinition {
  return {
    id,
    rootPath,
    entryPath: join(rootPath, "SKILL.md"),
    promptRootPath: dirname(dirname(rootPath)),
    promptResourcePath: `skills/${id}`,
    target,
  };
}

function mechanicSkill(id: string): DefaultSkillDefinition {
  const rootPath = setupTemplatePath("mechanic", "skills", id);
  return {
    id,
    rootPath,
    entryPath: join(rootPath, "SKILL.md"),
    promptRootPath: setupTemplatePath("mechanic"),
    promptResourcePath: `skills/${id}`,
    target: { kind: "agents", agentIds: ["mechanic"] },
  };
}

const DEFAULT_SKILLS: DefaultSkillDefinition[] = [
  defaultSkill(
    "coding-delegation",
    setupTemplatePath("skills", "coding-delegation"),
    { kind: "all" },
  ),
  defaultSkill(
    "memory-management",
    setupTemplatePath("skills", "memory-management"),
    { kind: "all" },
  ),
  defaultSkill(
    "journal-daily",
    setupTemplatePath("skills", "journal-daily"),
    { kind: "all" },
  ),
  defaultSkill(
    "journal-compact",
    setupTemplatePath("skills", "journal-compact"),
    { kind: "all" },
  ),
  mechanicSkill("setup"),
  mechanicSkill("mechanic"),
  mechanicSkill("add-agent"),
  mechanicSkill("channel-routing"),
  mechanicSkill("watches"),
  mechanicSkill("workspace-migration"),
  mechanicSkill("shrimpy-mechanic-ideas"),
];

export function listDefaultSkillDefinitions(
  agentId: string,
): DefaultSkillDefinition[] {
  return DEFAULT_SKILLS.filter((skill) =>
    skill.target.kind === "all" || skill.target.agentIds.includes(agentId)
  );
}
