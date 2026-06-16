import { createAppRuntime } from "../app/index.js";
import {
  addSkillPackage,
  inspectSkills,
  loadSkillPrompt,
  removeSkillPackage,
  scaffoldSkill,
  updateSkillPackage,
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
    const scope = skill.sourceKind === "package" ? `${skill.scope} package` : skill.scope;
    console.log(`${skill.id} [${scope}]${name}${loaded}${available}${summary}`);
    if (skill.packageInfo) {
      const assignment = skill.packageInfo.scope
        ? skill.packageInfo.scope === "agent"
          ? `agent ${skill.packageInfo.agentId ?? skill.agentId}`
          : "workspace"
        : skill.scope;
      const installedPath = skill.packageInfo.installedPath ?? skill.packageInfo.rootPath;
      const modified = skill.packageInfo.modified ? " yes" : " no";
      console.log(`  source: ${skill.packageInfo.source}`);
      console.log(`  assignment: ${assignment}`);
      console.log(`  installed: ${installedPath}`);
      console.log(`  modified:${modified}`);
    }
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
      path: { type: "string" },
      ref: { type: "string" },
      all: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const source = requireArg(positionals[0], usage, "source");
  const runtime = createAppRuntime(config);
  const scope = resolvePackageScope(values.workspace, values.agent);
  const agent = scope === "agent" ? runtime.getAgent(values.agent) : undefined;
  const result = await addSkillPackage({
    runtime,
    source,
    scope,
    agentId: agent?.id,
    path: values.path,
    ref: values.ref,
    all: values.all,
    force: values.force,
    dryRun: values["dry-run"],
  });
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  if (result.dryRun) {
    printAddDryRun(result);
    return 0;
  }
  const target = scope === "agent" ? `agent ${agent!.id}` : "workspace";
  if (result.packages.length === 1) {
    const skill = result.packages[0]!;
    console.log(`Added ${target} skill package ${skill.id}: ${skill.entryPath}`);
  } else {
    console.log(`Added ${target} skill packages:`);
    for (const skill of result.packages) {
      console.log(`- ${skill.id}: ${skill.entryPath}`);
    }
  }
  return 0;
}

async function updateSkill({ argv, config, usage }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      workspace: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const id = requireArg(positionals[0], usage, "skill id");
  const runtime = createAppRuntime(config);
  const target = resolveOptionalPackageScope(values.workspace, values.agent);
  const result = await updateSkillPackage({
    runtime,
    id,
    scope: target.scope,
    agentId: target.agentId,
    dryRun: values["dry-run"],
  });
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  if (result.updateAvailable) {
    if (result.dryRun) {
      console.log(`Update available for ${result.id}: ${result.current.sourceRevision ?? result.current.hash} -> ${result.latest?.sourceRevision ?? "unknown"}`);
    } else {
      console.log(`Updated skill package ${result.id}: ${result.packageInfo?.entryPath}`);
    }
  } else {
    console.log(`Skill package ${result.id}: ${result.reason ?? "package source is unchanged"}.`);
  }
  return 0;
}

async function removeSkill({ argv, config, usage }: CommandInvocation): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string", short: "a" },
      workspace: { type: "boolean", default: false },
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const id = requireArg(positionals[0], usage, "skill id");
  const runtime = createAppRuntime(config);
  const target = resolveOptionalPackageScope(values.workspace, values.agent);
  const result = removeSkillPackage({
    runtime,
    id,
    scope: target.scope,
    agentId: target.agentId,
  });
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }
  const label = result.scope === "agent" ? `agent ${result.agentId}` : "workspace";
  console.log(`Removed ${label} skill package ${result.id}: ${result.removedPath}`);
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

function resolveOptionalPackageScope(
  workspace: boolean,
  agent?: string,
): { scope?: "agent" | "workspace"; agentId?: string } {
  if (workspace && agent) {
    throw new CommandError("choose either --workspace or --agent, not both");
  }
  if (workspace) return { scope: "workspace" };
  if (agent) return { scope: "agent", agentId: agent };
  return {};
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
    update: updateSkill,
    remove: removeSkill,
    new: newSkill,
    validate: validateSkill,
  },
});

function printAddDryRun(result: Awaited<ReturnType<typeof addSkillPackage>>): void {
  const candidates = result.candidates;
  if (candidates.length === 0) {
    console.log("No skill packages found.");
    return;
  }
  console.log(`Found ${candidates.length} skill package${candidates.length === 1 ? "" : "s"} in ${result.source}:`);
  for (const candidate of candidates) {
    const revision = candidate.sourceRevision ? ` @ ${candidate.sourceRevision}` : "";
    console.log(`- ${candidate.id} (${candidate.path || "."})${revision}${candidate.description ? ` - ${candidate.description}` : ""}`);
  }
  if (result.selectedCandidates.length > 0) {
    console.log("Selected:");
    for (const candidate of result.selectedCandidates) {
      console.log(`- ${candidate.id} (${candidate.path || "."})`);
    }
  }
  console.log("No changes made.");
}
