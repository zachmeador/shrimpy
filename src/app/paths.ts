import { isAbsolute, join } from "node:path";
import { configDir, primaryConfigPath } from "../config/paths.js";

export interface WorkspacePaths {
  workspace: string;
  configDir: string;
  primaryConfigPath: string;
  channelMembershipsPath: string;
  agentsDir: string;
  profileDir: string;
  vaultDir: string;
  projectsDir: string;
  docsDir: string;
  frameworkDir: string;
  stateDir: string;
  runtimeDir: string;
  runtimeCursorsDir: string;
  runtimeContextDir: string;
  runtimePidsDir: string;
  piStateDir: string;
  authPath: string;
  modelsPath: string;
  channelsDir: string;
  mediaDir: string;
  logsDir: string;
  gatewayLogPath: string;
  gatewayPidPath: string;
  usersPath: string;
  cursorsPath: string;
  surfaceStatePath: string;
  schedulerStatePath: string;
  oneTimeSchedulesPath: string;
  systemSchedulesPath: string;
  workspacePromptPath: string;
  systemPromptPath: string;
  userPromptPath: string;
}

export interface AgentPaths {
  root: string;
  soulPath: string;
  contextDir: string;
  vaultDir: string;
  projectsDir: string;
  schedulesPath: string;
  skillsDir: string;
  sessionsDir: string;
}

export function createWorkspacePaths(
  workspace: string,
): WorkspacePaths {
  return {
    workspace,
    configDir: configDir(workspace),
    primaryConfigPath: primaryConfigPath(workspace),
    channelMembershipsPath: join(workspace, "config", "channels.json"),
    agentsDir: join(workspace, "agents"),
    profileDir: join(workspace, "profile"),
    vaultDir: join(workspace, "vault"),
    projectsDir: join(workspace, "projects"),
    docsDir: join(workspace, "docs"),
    frameworkDir: join(workspace, "docs", "framework"),
    stateDir: join(workspace, "state"),
    runtimeDir: join(workspace, "runtime"),
    runtimeCursorsDir: join(workspace, "runtime", "cursors"),
    runtimeContextDir: join(workspace, "runtime", "context"),
    runtimePidsDir: join(workspace, "runtime", "pids"),
    piStateDir: join(workspace, "state", "pi"),
    authPath: join(workspace, "state", "pi", "auth.json"),
    modelsPath: join(workspace, "state", "pi", "models.json"),
    channelsDir: join(workspace, "channels"),
    mediaDir: join(workspace, "media"),
    logsDir: join(workspace, "runtime", "logs"),
    gatewayLogPath: join(workspace, "runtime", "logs", "gateway.log"),
    gatewayPidPath: join(workspace, "runtime", "pids", "gateway.pid"),
    usersPath: join(workspace, "state", "users.json"),
    cursorsPath: join(workspace, "runtime", "cursors", "channels.json"),
    surfaceStatePath: join(workspace, "runtime", "cursors", "surface-threads.json"),
    schedulerStatePath: join(workspace, "state", "scheduler.json"),
    oneTimeSchedulesPath: join(workspace, "state", "one-time-schedules.json"),
    systemSchedulesPath: join(workspace, "config", "schedules.json"),
    workspacePromptPath: join(workspace, "profile", "WORKSPACE.md"),
    systemPromptPath: join(workspace, "profile", "SYSTEM.md"),
    userPromptPath: join(workspace, "profile", "USER.md"),
  };
}

export function createAgentPaths(
  workspace: string,
  agentRoot: string,
): AgentPaths {
  const root = isAbsolute(agentRoot) ? agentRoot : join(workspace, agentRoot);
  return {
    root,
    soulPath: join(root, "SOUL.md"),
    contextDir: join(root, "context"),
    vaultDir: join(root, "vault"),
    projectsDir: join(root, "projects"),
    schedulesPath: join(root, "schedules.json"),
    skillsDir: join(root, "skills"),
    sessionsDir: join(root, "sessions"),
  };
}
