import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export function configDir(workspace: string): string {
  return join(workspace, "config");
}

export function primaryConfigPath(workspace: string): string {
  return join(configDir(workspace), "shrimpy.json");
}

export function hasPrimaryConfig(workspace: string): boolean {
  return existsSync(primaryConfigPath(workspace));
}

export interface WorkspacePaths {
  workspace: string;
  configDir: string;
  primaryConfigPath: string;
  channelMembershipsPath: string;
  agentsDir: string;
  workspaceContextDir: string;
  docsDir: string;
  frameworkDir: string;
  stateDir: string;
  runtimeDir: string;
  runtimeBinDir: string;
  runtimeCursorsDir: string;
  runtimeContextDir: string;
  runtimeWatchesDir: string;
  runtimePidsDir: string;
  piStateDir: string;
  authPath: string;
  modelsPath: string;
  modelsStorePath: string;
  channelsDir: string;
  mediaDir: string;
  logsDir: string;
  gatewayLogPath: string;
  gatewayPidPath: string;
  gatewayStatePath: string;
  gatewayHealthPath: string;
  usersPath: string;
  workerBackendsStatePath: string;
  workersStatePath: string;
  runtimeWorkersDir: string;
  userPresencePath: string;
  cursorsPath: string;
  outboxCursorsPath: string;
  outboundReceiptsPath: string;
  surfaceStatePath: string;
  watchClockStatePath: string;
  workspaceSystemContextPath: string;
  workspaceUserContextPath: string;
  workspaceContextPath: string;
}

export interface AgentPaths {
  root: string;
  soulPath: string;
  contextDir: string;
  vaultDir: string;
  projectsDir: string;
  watchesPath: string;
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
    workspaceContextDir: join(workspace, "context"),
    docsDir: join(workspace, "docs"),
    frameworkDir: join(workspace, "docs", "framework"),
    stateDir: join(workspace, "state"),
    runtimeDir: join(workspace, "runtime"),
    runtimeBinDir: join(workspace, "runtime", "bin"),
    runtimeCursorsDir: join(workspace, "runtime", "cursors"),
    runtimeContextDir: join(workspace, "runtime", "context"),
    runtimeWatchesDir: join(workspace, "runtime", "watches"),
    runtimePidsDir: join(workspace, "runtime", "pids"),
    piStateDir: join(workspace, "state", "pi"),
    authPath: join(workspace, "state", "pi", "auth.json"),
    modelsPath: join(workspace, "state", "pi", "models.json"),
    modelsStorePath: join(workspace, "state", "pi", "models-store.json"),
    channelsDir: join(workspace, "channels"),
    mediaDir: join(workspace, "media"),
    logsDir: join(workspace, "runtime", "logs"),
    gatewayLogPath: join(workspace, "runtime", "logs", "gateway.log"),
    gatewayPidPath: join(workspace, "runtime", "pids", "gateway.pid"),
    gatewayStatePath: join(workspace, "runtime", "gateway-state.json"),
    gatewayHealthPath: join(workspace, "runtime", "gateway-health.json"),
    usersPath: join(workspace, "state", "users.json"),
    workerBackendsStatePath: join(workspace, "state", "worker-backends.json"),
    workersStatePath: join(workspace, "state", "workers.json"),
    runtimeWorkersDir: join(workspace, "runtime", "workers"),
    userPresencePath: join(workspace, "state", "user-presence.json"),
    cursorsPath: join(workspace, "runtime", "cursors", "channels.json"),
    outboxCursorsPath: join(workspace, "runtime", "cursors", "channel-outbox.json"),
    outboundReceiptsPath: join(workspace, "runtime", "channel-deliveries.json"),
    surfaceStatePath: join(workspace, "runtime", "cursors", "surface-threads.json"),
    watchClockStatePath: join(workspace, "state", "watch-clock.json"),
    workspaceSystemContextPath: join(workspace, "context", "SYSTEM.md"),
    workspaceUserContextPath: join(workspace, "context", "USER.md"),
    workspaceContextPath: join(workspace, "context", "WORKSPACE.md"),
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
    watchesPath: join(root, "watches.json"),
    skillsDir: join(root, "skills"),
    sessionsDir: join(root, "sessions"),
  };
}
