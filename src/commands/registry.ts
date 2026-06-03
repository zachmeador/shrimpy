import type { ShrimpyConfig } from "../config/index.js";
import { cmdAgent } from "./agent.js";
import { cmdChannels } from "./channels.js";
import { cmdCompletion } from "./completion.js";
import { cmdContext } from "./context.js";
import { cmdGateway } from "./gateway.js";
import { cmdModels } from "./models.js";
import { cmdRun } from "./run.js";
import { cmdSessions } from "./sessions.js";
import { cmdSetup } from "./setup.js";
import { cmdSkills } from "./skills.js";
import { cmdStatus } from "./status.js";
import { cmdSurface } from "./surface.js";
import { cmdUsers } from "./users.js";
import { cmdWatches } from "./watches.js";
import type { CommandHandler } from "./framework.js";

export interface RegisteredCommand {
  handler: CommandHandler;
  requiresConfig: boolean;
}

export const COMMAND_REGISTRY: Record<string, RegisteredCommand> = {
  gateway: { handler: cmdGateway, requiresConfig: true },
  status: { handler: cmdStatus, requiresConfig: true },
  channels: { handler: cmdChannels, requiresConfig: true },
  agent: { handler: cmdAgent, requiresConfig: true },
  surface: { handler: cmdSurface, requiresConfig: true },
  sessions: { handler: cmdSessions, requiresConfig: true },
  watches: { handler: cmdWatches, requiresConfig: true },
  models: { handler: cmdModels, requiresConfig: true },
  skills: { handler: cmdSkills, requiresConfig: true },
  setup: { handler: cmdSetup, requiresConfig: true },
  run: { handler: cmdRun, requiresConfig: true },
  context: { handler: cmdContext, requiresConfig: true },
  users: { handler: cmdUsers, requiresConfig: true },
  completion: { handler: cmdCompletion, requiresConfig: false },
};

export function configForRegisteredCommand(
  registration: RegisteredCommand,
  loadConfig: () => ShrimpyConfig,
): ShrimpyConfig {
  return registration.requiresConfig ? loadConfig() : { workspace: process.cwd() };
}
