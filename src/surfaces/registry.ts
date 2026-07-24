import type { ChannelBus } from "../channels/bus.js";
import type { IdentityStore } from "../gateway/identity-store.js";
import type {
  ChatSurfaceModule,
  SurfaceRuntime,
  SurfaceModuleResolved,
} from "./shared/module.js";
import type { SurfaceThreadStateStore } from "./shared/thread-state-store.js";
import type { GatewaySurface, SurfaceEgress } from "./shared/types.js";
import { telegramSurface } from "./telegram/module.js";

/**
 * Registered chat surface modules. Adding a new surface = drop in a folder
 * under `surfaces/<name>/` and add its module export here.
 */
export const surfaceModules: ChatSurfaceModule[] = [
  telegramSurface,
];

export function createConfiguredSurfaceEgresses(
  runtime: SurfaceRuntime,
): SurfaceEgress[] {
  return surfaceModules.flatMap((module) => module.createEgresses(runtime));
}

export function createConfiguredGatewaySurfaces(opts: {
  runtime: SurfaceRuntime;
  channelBus: ChannelBus;
  identityStore: IdentityStore;
  surfaceThreadStateStore: SurfaceThreadStateStore;
}): GatewaySurface[] {
  return surfaceModules.flatMap((module) => module.createGatewaySurfaces(opts));
}

export function resolveSurfaceDefaultAgentIds(
  runtime: SurfaceRuntime,
  channel: string,
): string[] {
  const ids = surfaceModules.flatMap((module) => {
    const resolved = runtime.surfaceConfig<SurfaceModuleResolved>(module.name);
    return module.resolveDefaultAgentIds(resolved, channel);
  });
  return [...new Set(ids)];
}

export type { SurfaceModuleResolved } from "./shared/module.js";
export { SurfaceThreadStateStore } from "./shared/thread-state-store.js";
export { registerSurfaceEgresses } from "./shared/types.js";
