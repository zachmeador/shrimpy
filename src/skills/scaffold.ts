import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import { getSkillView, type SkillView } from "./catalog.js";
import {
  normalizeSkillId,
  quoteYamlString,
  SKILL_ENTRYPOINT,
  SKILLS_DIR,
  skillNameForId,
  titleFromSkillName,
} from "./shared.js";

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
  const description = (opts.description?.trim() ?? "") || `Use for ${name} tasks.`;
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
