/**
 * Telegram surface module — entry point for the registry.
 *
 * Exports the ChatSurfaceModule that AppRuntime iterates, plus the
 * inspection helpers commands consume (loadTelegramOffset, telegramStatePath)
 * and the setup helpers (telegramChannelDisplayExample, validateTelegramInstanceId).
 */

import type { ChatSurfaceModule } from "../shared/module.js";
import {
  buildTelegramAdapterRoutes,
  resolveTelegramDefaultAgentIds,
  resolveTelegramRuntimeConfig,
  validateTelegramRuntimeConfig,
  type ResolvedTelegramRuntimeConfig,
} from "./config.js";
import {
  createTelegramGatewaySurfaces,
  createTelegramSurfaceEgresses,
} from "./surface.js";

export const telegramSurface: ChatSurfaceModule<ResolvedTelegramRuntimeConfig> = {
  name: "telegram",
  validateConfig: validateTelegramRuntimeConfig,
  resolveConfig: (raw, agentIds) =>
    resolveTelegramRuntimeConfig(raw, agentIds),
  buildAdapterRoutes: (resolved) => buildTelegramAdapterRoutes(resolved),
  createEgresses: (runtime) => {
    const resolved = runtime.surfaceConfig<ResolvedTelegramRuntimeConfig>("telegram");
    return createTelegramSurfaceEgresses(runtime, resolved);
  },
  createGatewaySurfaces: (opts) => {
    const resolved = opts.runtime.surfaceConfig<ResolvedTelegramRuntimeConfig>("telegram");
    return createTelegramGatewaySurfaces({ ...opts, resolved });
  },
  resolveDefaultAgentIds: (resolved, channel) =>
    resolveTelegramDefaultAgentIds(resolved, channel),
};

export {
  loadTelegramOffset,
  telegramStatePath,
  registerTelegramRoute,
} from "./surface.js";

export {
  telegramChannelDisplayExample,
  validateTelegramInstanceId,
  type ResolvedTelegramRuntimeConfig,
} from "./config.js";
