#!/usr/bin/env node

import { loadConfig } from "./config/index.js";
import { createAppRuntime } from "./app/index.js";
import { formatVersionLabel, readAppMetadata } from "./app/metadata.js";
import { cmdChannels } from "./commands/channels.js";
import { cmdGateway } from "./commands/gateway.js";
import { cmdRun } from "./commands/run.js";
import { cmdSetup } from "./commands/setup.js";
import { cmdStatus } from "./commands/status.js";
import { cmdContext } from "./commands/context.js";
import { cmdUsers } from "./commands/users.js";
import { cmdSessions } from "./commands/sessions.js";
import { cmdSkills } from "./commands/skills.js";
import { cmdAgent } from "./commands/agent.js";
import { cmdSurface } from "./commands/surface.js";
import {
  parseCommandArgs,
  runCommand,
  type CommandHandler,
} from "./commands/framework.js";
import {
  formatThinkingInputs,
  parseThinkingLevel,
} from "./inference/thinking.js";
import { runInteractiveAgentSession } from "./sessions/index.js";
import { brand, dim, heading } from "./util/style.js";

function renderHelp(): string {
  const metadata = readAppMetadata();
  const body = HELP_BODY
    .split("\n")
    .map((line) => styleHelpLine(line))
    .join("\n");
  return `${brand(formatVersionLabel(metadata))} - ${metadata.description}\n\n${heading("usage:")}\n${body}`;
}

function styleHelpLine(line: string): string {
  const match = line.match(/^(\s*)(shrimpy)(\s.*)?$/);
  if (!match) return line;
  const [, indent, name, rest] = match;
  return `${indent}${brand(name)}${rest ? styleUsageRest(rest) : ""}`;
}

function styleUsageRest(rest: string): string {
  const trimmed = rest.replace(/^\s+/, "");
  const leading = rest.slice(0, rest.length - trimmed.length);
  const descMatch = trimmed.match(/^(\S(?:.*?\S)?)(\s{2,}.+)?$/);
  if (!descMatch) return rest;
  const [, command, description] = descMatch;
  return `${leading}${command}${description ? dim(description) : ""}`;
}

const HELP_BODY = `  shrimpy                            launch interactive mode
  shrimpy --agent <id>               launch interactive mode as a specific agent
  shrimpy "prompt"                   launch with an initial prompt
  shrimpy run --agent <id> "prompt"  one-shot: run prompt, print result, exit
  shrimpy run --skill <id> "prompt"  one-shot with a loaded skill
  shrimpy status                     show gateway and workspace status
  shrimpy channels                   list channels
  shrimpy channels show <name>       inspect one channel
  shrimpy channels read <name>       read recent messages (--limit N)
  shrimpy channels tail <name>       watch a channel for new messages
  shrimpy channels create <name>     create or bootstrap channel membership
  shrimpy channels post <n> <text>   post a CLI human message to a channel
  shrimpy channels post <n> --agent <id> <text>  post addressed to one agent
  shrimpy channels members <name>    show channel membership
  shrimpy channels join <n> --agent <id>  add an agent to a channel
  shrimpy channels leave <n> --agent <id> remove an agent from a channel
  shrimpy agent list                 list configured agents
  shrimpy agent show <id>            show one agent config
  shrimpy agent add <id>             add a new agent and scaffold docs
  shrimpy agent schedules <id>       list one agent's schedules
  shrimpy agent schedule <id> <sid>  show one agent schedule
  shrimpy agent rename <a> <b>       rename an agent and update local state
  shrimpy agent remove <id>          remove an agent from config/state
  shrimpy agent run <id> "prompt"    one-shot prompt against a specific agent
  shrimpy agent tui <id>             launch interactive mode as a specific agent
  shrimpy surface                    list surface thread state
  shrimpy surface show <s> <id>      show one surface thread state
  shrimpy surface set-agent <s> <id> <agent>   set addressed agent
  shrimpy surface clear-agent <s> <id>         clear addressed agent
  shrimpy sessions new <channel>     reset an agent session for a channel
  shrimpy sessions clear <channel>   alias for session reset
  shrimpy sessions restore <channel> restore an archived session for a channel
  shrimpy sessions thinking <c> <l>  set session thinking level for a channel
  shrimpy sessions compaction <c>    inspect effective compaction policy
  shrimpy sessions list [channel]    inspect active and archived sessions (--json)
  shrimpy setup                      run first-run setup entrypoint
  shrimpy setup init                 create baseline config files
  shrimpy setup telegram             guided Telegram bot setup
  shrimpy skills list                list available skills
  shrimpy skills show <id>           print a skill's SKILL.md
  shrimpy users list                 inspect identity links and owner
  shrimpy users get-owner            show resolved owner identity
  shrimpy users set-owner <userId>   set workspace owner
  shrimpy context --agent <id>       render assembled session context
  shrimpy context --agent <id> "p"   render context with user message appended
  shrimpy context --channel <name>   render channel context for an agent
  shrimpy context --channel <n> "p"  render channel context with user message
  shrimpy context --turn -c <n> "p"  render context layers and turn preview
  shrimpy context --sections --json  inspect context layer metadata
  shrimpy context --config           dump resolved context config
  shrimpy context files list --agent <id>     list agent context files
  shrimpy context files list --older-than <d> filter by age
  shrimpy gateway status             show gateway activity status
  shrimpy gateway logs               show recent workspace gateway log lines
  shrimpy gateway install|uninstall  manage systemd user service
  shrimpy gateway start|stop|restart control the gateway
  shrimpy --agent <id>               set agent
  shrimpy --provider <p>             set LLM provider
  shrimpy --model <m>                set model
  shrimpy --thinking <l>             set thinking level
  shrimpy --skill <id>               preload a skill in interactive mode
  shrimpy -h, --help                 show this help
  shrimpy -v, --version              show version`;

const commands: Record<string, CommandHandler> = {
  gateway: cmdGateway,
  status: cmdStatus,
  channels: cmdChannels,
  agent: cmdAgent,
  surface: cmdSurface,
  sessions: cmdSessions,
  skills: cmdSkills,
  setup: cmdSetup,
  run: cmdRun,
  context: cmdContext,
  users: cmdUsers,
};

try {
  const sub = process.argv[2];
  if (sub && commands[sub]) {
    const config = loadConfig();
    const code = await runCommand(commands[sub], process.argv.slice(3), config);
    process.exit(code);
  }

  const { values, positionals } = parseCommandArgs({
    args: process.argv.slice(2),
    options: {
      agent: { type: "string", short: "a" },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      thinking: { type: "string" },
      skill: { type: "string", short: "k", multiple: true },
    },
    allowPositionals: true,
    strict: true,
    usage: renderHelp(),
  });

  if (values.help) {
    console.log(renderHelp());
    process.exit(0);
  }

  if (values.version) {
    console.log(brand(formatVersionLabel()));
    process.exit(0);
  }

  const prompt = positionals.length > 0 ? positionals.join(" ") : undefined;
  const thinking = values.thinking === undefined
    ? undefined
    : parseThinkingLevel(values.thinking);
  if (values.thinking !== undefined && thinking === undefined) {
    throw new Error(`thinking level must be one of: ${formatThinkingInputs()}`);
  }

  const config = loadConfig();
  const runtime = createAppRuntime(config);
  await runInteractiveAgentSession({
    runtime,
    agentId: values.agent,
    channel: "tui",
    sessionType: "tui",
    provider: values.provider,
    model: values.model,
    thinking,
    skills: values.skill,
    initialMessage: prompt,
    cwd: process.cwd(),
  });
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
