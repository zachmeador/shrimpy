import type { AppRuntime } from "../../app/runtime.js";
import type { ChannelBus } from "../../channels/bus.js";
import type { ChannelMembershipStore } from "../../channels/index.js";
import { surfaceAddressingStatusContent } from "../../channels/index.js";

export interface SurfaceAddressingChange {
  surface: string;
  threadId: string;
  channel: string;
  previousAgentId?: string;
  addressedAgentId?: string;
  joinedAgentId?: string;
  source: "chat" | "cli";
}

export function publishSurfaceAddressingChange(
  channelBus: ChannelBus,
  change: SurfaceAddressingChange,
): void {
  const content = surfaceAddressingStatusContent({
    surface: change.surface,
    threadId: change.threadId,
    previousAgentId: change.previousAgentId,
    addressedAgentId: change.addressedAgentId,
    joinedAgentId: change.joinedAgentId,
    source: change.source,
  });
  channelBus.publishStatus({
    channel: change.channel,
    actorId: "system:surface",
    transport: change.source,
    sourceChannel: change.channel,
    transportChatId: change.threadId,
    data: content.data,
  });
}

export function ensureSurfaceChannelMember(input: {
  memberships?: ChannelMembershipStore;
  channel: string;
  agentId: string;
}): boolean {
  const { memberships, channel, agentId } = input;
  if (!memberships) return false;
  if (memberships.listAgentIds(channel).includes(agentId)) return false;
  memberships.addAgent(channel, agentId);
  return true;
}

export function resolveSurfaceThreadChannel(
  runtime: AppRuntime,
  surface: string,
  threadId: string,
): string | null {
  void runtime;
  const [adapter, instance] = surface.split(".");
  if (!adapter || !instance || !threadId) return null;
  return `${adapter}~${instance}~${threadId}`;
}

export function isSurfaceAddressingStatus(value: unknown): boolean {
  return typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "surface_addressing";
}
