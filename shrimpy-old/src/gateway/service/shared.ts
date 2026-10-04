import { execFileSync, spawnSync, type ExecFileSyncOptions, type SpawnSyncOptions } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { resolveShrimpyRuntimeEnvironment } from "../../app/environment.js";
import { projectRoot } from "../../app/project-root.js";
import { findRunningGatewayPid, terminateGateway } from "../pid-file.js";
import { resolveWorkspacePath } from "../../workspace/location.js";

export interface GatewayCtlOptions {
  pidPath: string;
  workspace?: string;
  deps?: GatewayServiceDeps;
}

export type GatewayServiceAction =
  | "install"
  | "uninstall"
  | "start"
  | "stop"
  | "restart";

export type ExecFileSyncLike = (
  file: string,
  args: string[],
  options: ExecFileSyncOptions,
) => string | Buffer;

export type SpawnSyncLike = (
  file: string,
  args: string[],
  options: SpawnSyncOptions,
) => {
  error?: Error;
  status?: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

export interface GatewayServiceDeps {
  platform?: string;
  homeDir?: string;
  uid?: number;
  env?: NodeJS.ProcessEnv;
  workspace?: string;
  appRoot?: string;
  execFileSync?: ExecFileSyncLike;
  spawnSync?: SpawnSyncLike;
  existsSync?: (path: string) => boolean;
  mkdirSync?: (path: string, opts?: { recursive?: boolean }) => unknown;
  unlinkSync?: (path: string) => void;
  writeFileSync?: (path: string, content: string, encoding: BufferEncoding) => void;
}

export interface ResolvedGatewayServiceDeps {
  platform: string;
  homeDir: string;
  uid?: number;
  env: NodeJS.ProcessEnv;
  workspace: string;
  appRoot: string;
  execFileSync: ExecFileSyncLike;
  spawnSync: SpawnSyncLike;
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => unknown;
  unlinkSync: (path: string) => void;
  writeFileSync: (path: string, content: string, encoding: BufferEncoding) => void;
}

export type GatewayServiceManager = "systemd" | "launchd" | "manual";

export interface GatewayServicePaths {
  serviceName: string;
  launchdLabel: string;
  unitDir: string;
  unitPath: string;
  launchAgentDir: string;
  launchAgentPath: string;
  launchdLogPath: string;
}

export function resolveGatewayServiceDeps(deps: GatewayServiceDeps = {}): ResolvedGatewayServiceDeps {
  return {
    platform: deps.platform ?? process.platform,
    homeDir: deps.homeDir ?? homedir(),
    uid: deps.uid ?? (typeof process.getuid === "function" ? process.getuid() : undefined),
    env: deps.env ?? process.env,
    workspace: deps.workspace ?? resolveWorkspacePath(
      deps.homeDir ?? homedir(),
      deps.env ?? process.env,
    ),
    appRoot: deps.appRoot ?? projectRoot,
    execFileSync: deps.execFileSync ?? ((file, args, options) =>
      execFileSync(file, args, options)),
    spawnSync: deps.spawnSync ?? ((file, args, options) =>
      spawnSync(file, args, options)),
    existsSync: deps.existsSync ?? existsSync,
    mkdirSync: deps.mkdirSync ?? mkdirSync,
    unlinkSync: deps.unlinkSync ?? unlinkSync,
    writeFileSync: deps.writeFileSync ?? writeFileSync,
  };
}

export function gatewayServiceManager(platform: string = process.platform): GatewayServiceManager {
  if (platform === "linux") return "systemd";
  if (platform === "darwin") return "launchd";
  return "manual";
}

export function gatewayServicePaths(deps?: GatewayServiceDeps): GatewayServicePaths {
  const resolved = resolveGatewayServiceDeps(deps);
  const identity = gatewayServiceIdentity(resolved);
  return {
    serviceName: identity.serviceName,
    launchdLabel: identity.launchdLabel,
    unitDir: join(resolved.homeDir, ".config", "systemd", "user"),
    unitPath: join(resolved.homeDir, ".config", "systemd", "user", `${identity.serviceName}.service`),
    launchAgentDir: join(resolved.homeDir, "Library", "LaunchAgents"),
    launchAgentPath: join(resolved.homeDir, "Library", "LaunchAgents", `${identity.launchdLabel}.plist`),
    launchdLogPath: join(resolved.homeDir, "Library", "Logs", "Shrimpy", `${identity.serviceName}.launchd.log`),
  };
}

function gatewayServiceIdentity(deps: ResolvedGatewayServiceDeps): {
  serviceName: string;
  launchdLabel: string;
} {
  return resolveShrimpyRuntimeEnvironment(deps.workspace, {
    appRoot: deps.appRoot,
  });
}

export function nodePath(): string {
  return process.execPath;
}

export function gatewayScript(): string {
  return join(import.meta.dirname, "..", "..", "gateway.js");
}

export function runCommand(
  deps: ResolvedGatewayServiceDeps,
  command: string,
  args: string[],
): string {
  try {
    const output = deps.execFileSync(command, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return String(output).trim();
  } catch (err) {
    const stderr = commandErrorText(err);
    if (stderr) console.error(stderr);
    throw err;
  }
}

export function tryCommand(
  deps: ResolvedGatewayServiceDeps,
  command: string,
  args: string[],
): boolean {
  try {
    deps.execFileSync(command, args, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

export function commandErrorText(err: unknown): string | undefined {
  if (!(err instanceof Error) || !("stderr" in err)) return undefined;
  const stderr = err.stderr;
  if (typeof stderr === "string") return stderr.trim();
  if (Buffer.isBuffer(stderr)) return stderr.toString("utf-8").trim();
  return undefined;
}

export function commandStatus(
  deps: ResolvedGatewayServiceDeps,
  command: string,
  args: string[],
): string {
  const result = deps.spawnSync(command, args, { encoding: "utf-8" });
  if (result.error) return "unknown";
  const stdout = result.stdout === undefined ? "" : String(result.stdout).trim();
  return stdout || "unknown";
}

export async function reapStaleGateway(pidPath: string): Promise<void> {
  const pid = findRunningGatewayPid(pidPath);
  if (pid === null) return;
  console.log(`[gateway-ctl] terminating prior gateway (PID ${pid})`);
  await terminateGateway(pid);
}
