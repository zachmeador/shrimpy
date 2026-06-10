import type { AppRuntime } from "../../app/runtime.js";
import type { ChannelBus } from "../../channels/bus.js";
import type { ChannelMembershipStore } from "../../channels/index.js";

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
  channelBus.publishSystem({
    channel: change.channel,
    actorId: "system:surface",
    transport: change.source,
    sourceChannel: change.channel,
    transportChatId: change.threadId,
    data: {
      kind: "surface_addressing",
      surface: change.surface,
      threadId: change.threadId,
      previousAgentId: change.previousAgentId ?? null,
      addressedAgentId: change.addressedAgentId ?? null,
      joinedAgentId: change.joinedAgentId ?? null,
      source: change.source,
    },
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
  const route = runtime.resolved.adapterRouting.routes.find((candidate) =>
    candidate.adapter === surface
  );
  return route ? `${route.channelPrefix}${threadId}` : null;
}

export function isSurfaceAddressingStatus(value: unknown): boolean {
  return typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "surface_addressing";
}
