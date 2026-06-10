import type { AppRuntime } from "../app/index.js";
import type { ChannelBus } from "../channels/bus.js";
import { IdentityStore } from "../gateway/identity-store.js";
import { resolveUserChannelAlias } from "../surfaces/shared/user-presence.js";
import { renderCommandUsage } from "./catalog.js";
import {
  parseCommandArgs,
  usage,
} from "./framework.js";

const USAGE = renderCommandUsage(["channels", "post"]);

export async function cmdChannelsPost(
  runtime: AppRuntime,
  channelBus: ChannelBus,
  args: string[],
  json: boolean,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      agent: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage: USAGE,
  });

  const name = positionals[0];
  const text = positionals.slice(1).join(" ");
  if (!name || !text) {
    usage(USAGE, !name ? "channel required" : "text required");
  }

  if (values.agent) {
    runtime.getAgent(values.agent);
  }

  const owner = new IdentityStore(runtime.paths.usersPath).getOwnerIdentity();
  const resolvedChannel = resolveUserChannelAlias(runtime.paths.userPresencePath, name);
  const message = channelBus.publishHumanText({
    channel: resolvedChannel,
    text,
    actorId: owner?.actorId ?? "human:user:cli",
    userId: owner?.userId ?? "user:cli",
    displayName: owner?.displayName ?? "CLI",
    transport: "cli",
    addressedAgentId: values.agent,
  });

  if (json) {
    console.log(JSON.stringify({ channel: resolvedChannel, requestedChannel: name, message }, null, 2));
    return 0;
  }

  console.log(
    `posted to ${resolvedChannel}${name !== resolvedChannel ? ` (${name})` : ""}${values.agent ? ` addressed_agent=${values.agent}` : ""}`,
  );
  return 0;
}
