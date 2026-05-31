import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { createAppRuntime } from "../app/index.js";
import {
  deriveSkillIdFromSource,
  inspectSkills,
  loadSkillPrompt,
  normalizeSkillId,
  scaffoldSkill,
  validateSkills,
  type SkillScope,
} from "../skills/index.js";
import {
  CommandError,
  createCommandGroup,
  type CommandInvocation,
  parseCommandArgs,
  requireArg,
  type CommandHandler,
} from "./framework.js";

const USAGE = `usage:
  shrimpy skills list [--agent <id>] [--json]
  shrimpy skills show <id> [--agent <id>]
  shrimpy skills add <id> [--agent <id>|--workspace] [--description <text>] [--force]
  shrimpy skills install <source> [--agent <id>|--workspace] [--id <id>] [--force]
  shrimpy skills validate [id] [--agent <id>] [--json]`;

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
    console.log(`${skill.id} [${skill.scope}]${name}${loaded}${summary}`);
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
      description: { type: "string", short: "d" },
      force: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const id = requireArg(positionals[0], usage, "skill id");
  const runtime = createAppRuntime(config);
  const scope = resolveMutationScope(values.workspace, values.agent);
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

async function installSkill({ argv, config, usage }: CommandInvocation): Promise<number> {
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
  const sourceArg = requireArg(positionals[0], usage, "source");
  const sourcePath = resolve(process.cwd(), sourceArg);
  if (!existsSync(sourcePath)) {
    throw new CommandError(`skill source does not exist: ${sourcePath}`);
  }
  const sourceStats = statSync(sourcePath);
  const sourceIsDirectory = sourceStats.isDirectory();
  const sourceIsMarkdownFile = sourceStats.isFile() && sourcePath.endsWith(".md");
  if (sourceIsDirectory && !existsSync(join(sourcePath, "SKILL.md"))) {
    throw new CommandError(`skill directory is missing SKILL.md: ${sourcePath}`);
  }
  if (!sourceIsDirectory && !sourceIsMarkdownFile) {
    throw new CommandError(`skill source must be a directory or Markdown file: ${sourcePath}`);
  }

  const runtime = createAppRuntime(config);
  const scope = resolveMutationScope(values.workspace, values.agent);
  const skillId = normalizeSkillId(values.id ?? deriveSkillIdFromSource(sourcePath));
  const targetRoot = resolveSkillTargetRoot(runtime, scope, values.agent, skillId);

  if (existsSync(targetRoot)) {
    if (!values.force) {
      throw new CommandError(`skill already exists: ${targetRoot}`);
    }
    rmSync(targetRoot, { recursive: true, force: true });
  }

  if (sourceIsDirectory) {
    cpSync(sourcePath, targetRoot, { recursive: true, force: false });
  } else {
    mkdirSync(targetRoot, { recursive: true });
    cpSync(sourcePath, join(targetRoot, "SKILL.md"), { force: false });
  }

  console.log(`Installed ${scope} skill ${skillId}: ${join(targetRoot, "SKILL.md")}`);
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

function resolveMutationScope(workspace: boolean, agent?: string): SkillScope {
  if (workspace && agent) {
    throw new CommandError("choose either --workspace or --agent, not both");
  }
  return agent ? "agent" : "workspace";
}

function resolveSkillTargetRoot(
  runtime: ReturnType<typeof createAppRuntime>,
  scope: SkillScope,
  agentId: string | undefined,
  skillId: string,
): string {
  if (scope === "agent") {
    const agent = runtime.getAgent(agentId);
    return join(runtime.getAgentPaths(agent.id).skillsDir, ...skillId.split("/"));
  }
  return join(runtime.paths.workspace, "skills", ...skillId.split("/"));
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
    install: installSkill,
    validate: validateSkill,
  },
});
