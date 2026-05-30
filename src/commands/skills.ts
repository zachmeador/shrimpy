import { createAppRuntime } from "../app/index.js";
import {
  listSkillViews,
  loadSkillPrompt,
} from "../skills/index.js";
import {
  createCommandGroup,
  type CommandInvocation,
  parseCommandArgs,
  requireArg,
  type CommandHandler,
} from "./framework.js";

const USAGE = `usage:
  shrimpy skills list [--agent <id>] [--json]
  shrimpy skills show <id> [--agent <id>]`;

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
  const skills = listSkillViews(runtime, values.agent);
  if (values.json) {
    console.log(JSON.stringify({ skills }, null, 2));
    return 0;
  }
  if (skills.length === 0) {
    console.log("No skills found.");
    return 0;
  }
  for (const skill of skills) {
    const summary = skill.description ? ` - ${skill.description}` : "";
    console.log(`${skill.id} [${skill.scope}]${summary}`);
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

export const cmdSkills: CommandHandler = createCommandGroup({
  name: "skills",
  usage: USAGE,
  default: listSkills,
  commands: {
    list: listSkills,
    show: showSkill,
  },
});
