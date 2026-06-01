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
  cmdAgentInspect,
  cmdAgentList,
  cmdAgentShow,
} from "./agent-view.js";
import { renderGroupUsage } from "./catalog.js";
import {
  createCommandGroup,
  stripFlag,
  type CommandHandler,
} from "./framework.js";

const USAGE = renderGroupUsage("agent");

function createAgentCommand(json: boolean): CommandHandler {
  return createCommandGroup({
    name: "agent",
    usage: USAGE,
    commands: {
      list: ({ config }) => cmdAgentList(config, json),
      show: ({ argv, config, usage }) => cmdAgentShow(config, argv[0], usage),
      inspect: ({ argv, config, usage }) => cmdAgentInspect(config, argv[0], json, usage),
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
