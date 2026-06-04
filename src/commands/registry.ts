import type { ShrimpyConfig } from "../config/index.js";
import type { CommandHandler } from "./framework.js";

export interface RegisteredCommand {
  requiresConfig: boolean;
  load: () => Promise<CommandHandler>;
}

export const COMMAND_REGISTRY: Record<string, RegisteredCommand> = {
  gateway: { requiresConfig: true, load: async () => (await import("./gateway.js")).cmdGateway },
  status: { requiresConfig: true, load: async () => (await import("./status.js")).cmdStatus },
  channels: { requiresConfig: true, load: async () => (await import("./channels.js")).cmdChannels },
  agent: { requiresConfig: true, load: async () => (await import("./agent.js")).cmdAgent },
  surface: { requiresConfig: true, load: async () => (await import("./surface.js")).cmdSurface },
  sessions: { requiresConfig: true, load: async () => (await import("./sessions.js")).cmdSessions },
  watches: { requiresConfig: true, load: async () => (await import("./watches.js")).cmdWatches },
  models: { requiresConfig: true, load: async () => (await import("./models.js")).cmdModels },
  skills: { requiresConfig: true, load: async () => (await import("./skills.js")).cmdSkills },
  setup: { requiresConfig: true, load: async () => (await import("./setup.js")).cmdSetup },
  run: { requiresConfig: true, load: async () => (await import("./run.js")).cmdRun },
  context: { requiresConfig: true, load: async () => (await import("./context.js")).cmdContext },
  users: { requiresConfig: true, load: async () => (await import("./users.js")).cmdUsers },
  completion: { requiresConfig: false, load: async () => (await import("./completion.js")).cmdCompletion },
};

export function configForRegisteredCommand(
  registration: RegisteredCommand,
  loadConfig: () => ShrimpyConfig,
): ShrimpyConfig {
  return registration.requiresConfig ? loadConfig() : { workspace: process.cwd() };
}
