import { createAppRuntime } from "../app/index.js";
import {
  cmdChannelsList,
  cmdChannelsRead,
  cmdChannelsShow,
  cmdChannelsTail,
} from "./channels-inspect.js";
import {
  cmdChannelsCreate,
  cmdChannelsDm,
  cmdChannelsJoinOrLeave,
  cmdChannelsMembers,
} from "./channels-membership.js";
import { cmdChannelsPost } from "./channels-post.js";
import {
  createCommandGroup,
  stripFlag,
  type CommandHandler,
} from "./framework.js";

const USAGE = `usage:
  shrimpy channels [--json]
  shrimpy channels show <name> [--json]
  shrimpy channels read <name> [--limit N] [--json]
  shrimpy channels tail <name>
  shrimpy channels create <name> [--json]
  shrimpy channels post <name> [--agent <id>] <text> [--json]
  shrimpy channels dm <agent-a> <agent-b> [--json]
  shrimpy channels members <name> [--json]
  shrimpy channels join <name> --agent <id> [--json]
  shrimpy channels leave <name> --agent <id> [--json]`;

function createChannelsCommand(json: boolean): CommandHandler {
  return createCommandGroup({
    name: "channels",
    usage: USAGE,
    default: ({ config }) => cmdChannelsList(createAppRuntime(config), json),
    commands: {
      show: ({ argv, config }) => cmdChannelsShow(createAppRuntime(config), argv, json),
      read: ({ argv, config }) => cmdChannelsRead(createAppRuntime(config), argv, json),
      tail: ({ argv, config }) => {
        const runtime = createAppRuntime(config);
        return cmdChannelsTail(runtime.createChannelBus(), argv);
      },
      create: ({ argv, config }) => cmdChannelsCreate(createAppRuntime(config), argv, json),
      post: ({ argv, config }) => {
        const runtime = createAppRuntime(config);
        return cmdChannelsPost(runtime, runtime.createChannelBus(), argv, json);
      },
      dm: ({ argv, config }) => cmdChannelsDm(createAppRuntime(config), argv, json),
      members: ({ argv, config }) => cmdChannelsMembers(createAppRuntime(config), argv, json),
      join: ({ argv, config }) => cmdChannelsJoinOrLeave(createAppRuntime(config), "join", argv, json),
      leave: ({ argv, config }) => cmdChannelsJoinOrLeave(createAppRuntime(config), "leave", argv, json),
    },
  });
}

export const cmdChannels: CommandHandler = async (argv, config) => {
  const stripped = stripFlag(argv, "--json");
  return createChannelsCommand(stripped.present)(stripped.argv, config);
};
