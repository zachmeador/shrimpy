import { cmdAgentAttention } from "./agent-attention.js";
import {
  cmdAgentAdd,
  cmdAgentSet,
} from "./agent-config.js";
import {
  cmdAgentRemove,
  cmdAgentRename,
} from "./agent-identity.js";
import {
  cmdAgentSchedule,
  cmdAgentSchedules,
} from "./agent-schedules.js";
import {
  cmdAgentRun,
  cmdAgentTui,
} from "./agent-session.js";
import {
  cmdAgentList,
  cmdAgentShow,
} from "./agent-view.js";
import {
  createCommandGroup,
  stripFlag,
  type CommandHandler,
} from "./framework.js";

const USAGE = `usage:
  shrimpy agent list [--json]
  shrimpy agent show <id>
  shrimpy agent add <id> [--root <path>] [--provider <p>] [--model <m>] [--tools a,b] [--thinking <level>] [--attention <mode>] [--json]
  shrimpy agent set <id> [--root <path>] [--provider <p>] [--model <m>] [--tools a,b] [--thinking <level>] [--attention <mode>] [--json]
  shrimpy agent rename <old-id> <new-id> [--json]
  shrimpy agent remove <id> [--delete-files] [--json]
  shrimpy agent attention <id> [--channel <name>] [--json]
  shrimpy agent attention set <id> [--channel <pattern>] [--mode <all|mentions|addressed|none>] [--senders a,b] [--actor-ids a,b] [--user-ids a,b] [--json]
  shrimpy agent attention clear <id> [--channel <pattern>] [--mode] [--senders] [--actor-ids] [--user-ids] [--json]
  shrimpy agent attention test <id> --channel <name> --sender <human|agent|system> --text <text> [--addressed <id>] [--json]
  shrimpy agent schedules <id> [--json]
  shrimpy agent schedule <id> <schedule-id> [--json]
  shrimpy agent run <id> <prompt>
  shrimpy agent tui <id> [prompt] [--provider <p>] [--model <m>] [--thinking <level>]`;

function createAgentCommand(json: boolean): CommandHandler {
  return createCommandGroup({
    name: "agent",
    usage: USAGE,
    commands: {
      list: ({ config }) => cmdAgentList(config, json),
      show: ({ argv, config, usage }) => cmdAgentShow(config, argv[0], usage),
      run: ({ argv, config, usage }) => cmdAgentRun(config, argv, usage),
      tui: ({ argv, config, usage }) => cmdAgentTui(config, argv, usage),
      remove: ({ argv, config, usage }) => cmdAgentRemove(config, argv, json, usage),
      rename: ({ argv, config, usage }) => cmdAgentRename(config, argv, json, usage),
      add: ({ argv, config, usage }) => cmdAgentAdd(config, argv, json, usage),
      set: ({ argv, config, usage }) => cmdAgentSet(config, argv, json, usage),
      attention: ({ argv, config, usage }) => cmdAgentAttention(config, argv, json, usage),
      schedules: ({ argv, config, usage }) => cmdAgentSchedules(config, argv, json, usage),
      schedule: ({ argv, config, usage }) => cmdAgentSchedule(config, argv, json, usage),
    },
  });
}

export const cmdAgent: CommandHandler = async (argv, config) => {
  const stripped = stripFlag(argv, "--json");
  return createAgentCommand(stripped.present)(stripped.argv, config);
};
