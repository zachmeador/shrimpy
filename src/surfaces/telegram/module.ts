/**
 * Telegram surface module — entry point for the registry.
 *
 * Exports the ChatSurfaceModule that AppRuntime iterates, plus the
 * inspection helpers commands consume (loadTelegramOffset, telegramStatePath)
 * and the setup helpers (telegramChannelDisplayExample, validateTelegramInstanceId).
 */

import type { ChatSurfaceModule } from "../shared/module.js";
import {
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
  createEgresses: (runtime) => {
    const resolved = runtime.surfaceConfig("telegram") as ResolvedTelegramRuntimeConfig;
    return createTelegramSurfaceEgresses(runtime, resolved);
  },
  createGatewaySurfaces: (opts) => {
    const resolved = opts.runtime.surfaceConfig("telegram") as ResolvedTelegramRuntimeConfig;
    return createTelegramGatewaySurfaces({ ...opts, resolved });
  },
  resolveDefaultAgentIds: (resolved, channel) =>
    resolveTelegramDefaultAgentIds(resolved, channel),
};

export {
  loadTelegramOffset,
  telegramStatePath,
  registerTelegramEgress,
} from "./surface.js";

export {
  telegramChannelDisplayExample,
  validateTelegramInstanceId,
  type ResolvedTelegramRuntimeConfig,
} from "./config.js";
