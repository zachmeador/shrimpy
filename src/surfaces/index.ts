import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import type { IdentityStore } from "../gateway/identity-store.js";
import type {
  ChatSurfaceModule,
  SurfaceModuleResolved,
} from "./shared/module.js";
import type { SurfaceThreadStateStore } from "./shared/thread-state-store.js";
import type { GatewaySurface, SurfaceEgress } from "./shared/types.js";
import { telegramSurface } from "./telegram/index.js";

/**
 * Registered chat surface modules. Adding a new surface = drop in a folder
 * under `surfaces/<name>/` and add its module export here.
 */
export const surfaceModules: ChatSurfaceModule[] = [
  telegramSurface,
];

export function findSurfaceModule(name: string): ChatSurfaceModule | undefined {
  return surfaceModules.find((module) => module.name === name);
}

export function createConfiguredSurfaceEgresses(
  runtime: AppRuntime,
): SurfaceEgress[] {
  return surfaceModules.flatMap((module) => module.createEgresses(runtime));
}

export function createConfiguredGatewaySurfaces(opts: {
  runtime: AppRuntime;
  channelBus: ChannelBus;
  identityStore: IdentityStore;
  surfaceThreadStateStore: SurfaceThreadStateStore;
}): GatewaySurface[] {
  return surfaceModules.flatMap((module) => module.createGatewaySurfaces(opts));
}

export function resolveSurfaceDefaultAgentIds(
  runtime: AppRuntime,
  channel: string,
): string[] {
  const ids = surfaceModules.flatMap((module) => {
    const resolved = runtime.surfaceConfig<SurfaceModuleResolved>(module.name);
    return module.resolveDefaultAgentIds(resolved, channel);
  });
  return [...new Set(ids)];
}

export type { ChatSurfaceModule, ResolvedSurfaceInstance, SurfaceModuleResolved } from "./shared/module.js";
export { SurfaceThreadStateStore } from "./shared/thread-state-store.js";
export type { SurfaceThreadStateEntry } from "./shared/thread-state-store.js";
export { registerSurfaceRoutes } from "./shared/types.js";
export type { GatewaySurface, SurfaceEgress } from "./shared/types.js";
export {
  ChatSurfacePublisher,
  PendingByThread,
  mergeChatTextBurst,
} from "./shared/chat-bridge.js";
export type { ChatHumanMessageBase, ChatSurfacePublisherConfig } from "./shared/chat-bridge.js";
