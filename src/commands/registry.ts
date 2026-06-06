import type { ShrimpyConfig } from "../config/index.js";
import { resolveWorkspacePath } from "../config/index.js";
import type { CommandHandler } from "./framework.js";

export type ConfigRequirement = boolean | "workspace";
export type ConfigRequirementSpec =
  | ConfigRequirement
  | ((argv: string[]) => ConfigRequirement);

export interface RegisteredCommand {
  requiresConfig: ConfigRequirementSpec;
  load: () => Promise<CommandHandler>;
}

export const COMMAND_REGISTRY: Record<string, RegisteredCommand> = {
  gateway: { requiresConfig: true, load: async () => (await import("./gateway.js")).cmdGateway },
  status: { requiresConfig: true, load: async () => (await import("./status.js")).cmdStatus },
  channels: { requiresConfig: true, load: async () => (await import("./channels.js")).cmdChannels },
  agent: { requiresConfig: (argv) => argv[0] === "tui" ? "workspace" : true, load: async () => (await import("./agent.js")).cmdAgent },
  surface: { requiresConfig: true, load: async () => (await import("./surface.js")).cmdSurface },
  sessions: { requiresConfig: true, load: async () => (await import("./sessions.js")).cmdSessions },
  watches: { requiresConfig: true, load: async () => (await import("./watches.js")).cmdWatches },
  models: { requiresConfig: true, load: async () => (await import("./models.js")).cmdModels },
  workspace: { requiresConfig: true, load: async () => (await import("./workspace.js")).cmdWorkspace },
  skills: { requiresConfig: true, load: async () => (await import("./skills.js")).cmdSkills },
  setup: { requiresConfig: "workspace", load: async () => (await import("./setup.js")).cmdSetup },
  chat: { requiresConfig: "workspace", load: async () => (await import("./chat.js")).cmdChat },
  run: { requiresConfig: true, load: async () => (await import("./run.js")).cmdRun },
  mechanic: { requiresConfig: "workspace", load: async () => (await import("./mechanic.js")).cmdMechanic },
  context: { requiresConfig: true, load: async () => (await import("./context.js")).cmdContext },
  users: { requiresConfig: true, load: async () => (await import("./users.js")).cmdUsers },
  help: { requiresConfig: false, load: async () => (await import("./help-command.js")).cmdHelp },
  completion: { requiresConfig: false, load: async () => (await import("./completion.js")).cmdCompletion },
};

export function configForRegisteredCommand(
  registration: RegisteredCommand,
  loadConfig: () => ShrimpyConfig,
  argv: string[] = [],
): ShrimpyConfig {
  const requirement = resolveConfigRequirement(registration, argv);
  if (requirement === true) return loadConfig();
  if (requirement === "workspace") {
    return { workspace: resolveWorkspacePath() };
  }
  return { workspace: process.cwd() };
}

export function resolveConfigRequirement(
  registration: RegisteredCommand,
  argv: string[] = [],
): ConfigRequirement {
  return typeof registration.requiresConfig === "function"
    ? registration.requiresConfig(argv)
    : registration.requiresConfig;
}
