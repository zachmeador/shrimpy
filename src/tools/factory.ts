import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import type { ChannelBus } from "../channels/bus.js";
import type { ResolvedToolRuntimeConfig } from "../config/index.js";
import type { SessionBootstrap } from "../sessions/index.js";
import { createDaemonTools } from "./daemon.js";
import type { DaemonToolName } from "./names.js";

interface BuildRuntimeToolsOpts {
  bootstrap: SessionBootstrap;
  channelBus: ChannelBus;
  toolConfig: ResolvedToolRuntimeConfig;
  agentId?: string;
  toolNames?: DaemonToolName[];
  actorId?: string;
}

export function buildRuntimeTools(
  opts: BuildRuntimeToolsOpts,
): ToolDefinition[] {
  return createDaemonTools({
    channelBus: opts.channelBus,
    bootstrap: opts.bootstrap,
    toolConfig: opts.toolConfig,
    agentId: opts.agentId,
    sendMessageActorId: opts.actorId,
    toolNames: opts.toolNames,
  });
}
