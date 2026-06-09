import { createAppRuntime } from "../app/index.js";
import {
  addSkillPackage,
  inspectSkills,
  loadSkillPrompt,
  scaffoldSkill,
  validateSkills,
} from "../skills/index.js";
import {
  CommandError,
  createCommandGroup,
  type CommandInvocation,
  parseCommandArgs,
  requireArg,
  type CommandHandler,
} from "./framework.js";
import { renderGroupUsage } from "./catalog.js";

const USAGE = renderGroupUsage("skills");

async function listSkills({ argv, config, usage }: CommandInvocation): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
    usage,
  });
  const runtime = createAppRuntime(config);
  const inventory = inspectSkills(runtime, values.agent);
  if (values.json) {
    console.log(JSON.stringify(inventory, null, 2));
    return 0;
  }
  if (inventory.skills.length === 0) {
    console.log("No skills found.");
    return 0;
  }
  for (const skill of inventory.skills) {
    const summary = skill.description ? ` - ${skill.description}` : "";
    const name = skill.name !== skill.id ? ` name=${skill.name}` : "";
    const loaded = skill.loaded ? "" : " (not loaded by Pi)";
    const available = skill.available ? "" : ` (unavailable: ${skill.blockedReasons.join("; ")})`;
    console.log(`${skill.id} [${skill.scope}]${name}${loaded}${available}${summary}`);
  }
  for (const warning of inventory.warnings) {
    console.log(`warning: ${warning}`);
  }
  return 0;
}

async function showSkill({ argv, config, usage }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const skillId = requireArg(positionals[0], usage, "skill id");
  const runtime = createAppRuntime(config);
  console.log(loadSkillPrompt(runtime, skillId, values.agent));
  return 0;
}

async function addSkill({ argv, config, usage }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      workspace: { type: "boolean", default: false },
      id: { type: "string" },
      force: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const source = requireArg(positionals[0], usage, "source");
  const runtime = createAppRuntime(config);
  const scope = resolvePackageScope(values.workspace, values.agent);
  const agent = scope === "agent" ? runtime.getAgent(values.agent) : undefined;
  const skill = await addSkillPackage({
    runtime,
    source,
    scope,
    agentId: agent?.id,
    id: values.id,
    force: values.force,
  });
  const target = scope === "agent" ? `agent ${agent!.id}` : "workspace";
  console.log(`Added ${target} skill package ${skill.id}: ${skill.entryPath}`);
  return 0;
}

async function newSkill({ argv, config, usage }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      workspace: { type: "boolean", default: false },
      description: { type: "string", short: "d" },
      force: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const id = requireArg(positionals[0], usage, "skill id");
  const runtime = createAppRuntime(config);
  const scope = resolveLocalMutationScope(values.workspace, values.agent);
  const skill = scaffoldSkill({
    runtime,
    id,
    scope,
    agentId: values.agent,
    description: values.description,
    force: values.force,
  });
  console.log(`Created ${skill.scope} skill ${skill.id}: ${skill.entryPath}`);
  return 0;
}

async function validateSkill({ argv, config, usage }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const runtime = createAppRuntime(config);
  const result = validateSkills(runtime, {
    agentId: values.agent,
    skillId: positionals[0],
  });
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return hasValidationErrors(result) ? 1 : 0;
  }
  if (result.issues.length === 0) {
    console.log("skills validation passed");
    return 0;
  }
  for (const issue of result.issues) {
    const skill = issue.skillId ? ` ${issue.skillId}` : "";
    const path = issue.path ? ` (${issue.path})` : "";
    console.log(`[${issue.level}]${skill} ${issue.message}${path}`);
  }
  return hasValidationErrors(result) ? 1 : 0;
}

function resolvePackageScope(workspace: boolean, agent?: string): "agent" | "workspace" {
  if (workspace && agent) {
    throw new CommandError("choose either --workspace or --agent, not both");
  }
  return workspace ? "workspace" : "agent";
}

function resolveLocalMutationScope(workspace: boolean, agent?: string): "agent" | "workspace" {
  if (workspace && agent) {
    throw new CommandError("choose either --workspace or --agent, not both");
  }
  return agent ? "agent" : "workspace";
}

function hasValidationErrors(result: ReturnType<typeof validateSkills>): boolean {
  return result.issues.some((issue) => issue.level === "error");
}

export const cmdSkills: CommandHandler = createCommandGroup({
  name: "skills",
  usage: USAGE,
  default: listSkills,
  commands: {
    list: listSkills,
    show: showSkill,
    add: addSkill,
    new: newSkill,
    validate: validateSkill,
  },
});
