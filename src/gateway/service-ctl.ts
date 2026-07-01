/**
 * Manage shrimpy gateway as a per-user platform service.
 *
 * Linux uses systemd --user. macOS uses a per-user LaunchAgent.
 */

import {
  execFileSync,
  spawnSync,
  type ExecFileSyncOptions,
  type SpawnSyncOptions,
} from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import {
  pathWithShrimpyRuntimeBin,
  resolveShrimpyRuntimeEnvironment,
} from "../app/environment.js";
import { projectRoot } from "../app/project-root.js";
import {
  findRunningGatewayPid,
  terminateGateway,
} from "./pid-file.js";
import { resolveWorkspacePath, WORKSPACE_ENV_VAR } from "../config/workspace.js";

interface GatewayCtlOptions {
  pidPath: string;
  workspace?: string;
  deps?: GatewayServiceDeps;
}

type ExecFileSyncLike = (
  file: string,
  args: string[],
  options: ExecFileSyncOptions,
) => string | Buffer;

type SpawnSyncLike = (
  file: string,
  args: string[],
  options: SpawnSyncOptions,
) => {
  error?: Error;
  status?: number | null;
  stdout?: string | Buffer;
  stderr?: string | Buffer;
};

interface GatewayServiceDeps {
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

interface ResolvedGatewayServiceDeps {
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

type GatewayServiceManager = "systemd" | "launchd" | "manual";

interface GatewayServicePaths {
  serviceName: string;
  launchdLabel: string;
  unitDir: string;
  unitPath: string;
  launchAgentDir: string;
  launchAgentPath: string;
  launchdLogPath: string;
}

export interface GatewayServiceStatus {
  manager: GatewayServiceManager;
  serviceName: string;
  active: string;
  enabled: string;
  definitionPath?: string;
  serviceLogPath?: string;
  detail?: string;
}

function resolveDeps(deps: GatewayServiceDeps = {}): ResolvedGatewayServiceDeps {
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
  const resolved = resolveDeps(deps);
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

function nodePath(): string {
  return process.execPath;
}

function gatewayScript(): string {
  return join(import.meta.dirname, "..", "gateway.js");
}

export function generateSystemdUnit(opts: {
  node?: string;
  script?: string;
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  workspace: string;
}): string {
  const node = opts.node ?? nodePath();
  const script = opts.script ?? gatewayScript();
  const homeDir = opts.homeDir ?? homedir();
  const pathValue = opts.env?.PATH;
  const workspace = opts.workspace;
  if (!workspace) throw new Error("gateway systemd unit generation requires a workspace");
  const environmentLines: string[] = [];
  if (pathValue !== undefined) {
    const path = pathWithShrimpyRuntimeBin(pathValue, workspace, homeDir);
    environmentLines.push(`Environment=${systemdQuote(`PATH=${path}`)}`);
  }
  environmentLines.push(`Environment=${systemdQuote(`${WORKSPACE_ENV_VAR}=${workspace}`)}`);
  const environment = environmentLines.length > 0 ? `${environmentLines.join("\n")}\n` : "";

  return `[Unit]
Description=shrimpy gateway
After=network.target

[Service]
Type=simple
${environment}ExecStart=${node} ${script}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function systemdQuote(value: string): string {
  return `"${value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("%", "%%")}"`;
}

export function generateLaunchAgentPlist(opts: {
  label?: string;
  node?: string;
  script?: string;
  homeDir?: string;
  logPath?: string;
  env?: NodeJS.ProcessEnv;
  workspace: string;
  appRoot?: string;
}): string {
  const workspace = opts.workspace;
  if (!workspace) throw new Error("gateway LaunchAgent generation requires a workspace");
  const runtimeEnv = resolveShrimpyRuntimeEnvironment(workspace, {
    ...(opts.appRoot ? { appRoot: opts.appRoot } : {}),
  });
  const label = opts.label ?? runtimeEnv.launchdLabel;
  const node = opts.node ?? nodePath();
  const script = opts.script ?? gatewayScript();
  const homeDir = opts.homeDir ?? homedir();
  const logPath = opts.logPath ?? join(
    homeDir,
    "Library",
    "Logs",
    "Shrimpy",
    `${runtimeEnv.serviceName}.launchd.log`,
  );
  const pathValue = opts.env?.PATH;
  const environmentEntries: Array<[string, string]> = [];
  if (pathValue) {
    environmentEntries.push([
      "PATH",
      pathWithShrimpyRuntimeBin(pathValue, workspace, homeDir),
    ]);
  }
  environmentEntries.push([WORKSPACE_ENV_VAR, workspace]);
  const environment = environmentEntries.length > 0
    ? `
  <key>EnvironmentVariables</key>
  <dict>
${environmentEntries.map(([key, value]) => `    <key>${xmlEscape(key)}</key>
    <string>${xmlEscape(value)}</string>`).join("\n")}
  </dict>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(node)}</string>
    <string>${xmlEscape(script)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(homeDir)}</string>${environment}
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${xmlEscape(logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(logPath)}</string>
</dict>
</plist>
`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function systemctl(deps: ResolvedGatewayServiceDeps, ...args: string[]): string {
  return runCommand(deps, "systemctl", ["--user", ...args]);
}

function launchctl(deps: ResolvedGatewayServiceDeps, ...args: string[]): string {
  return runCommand(deps, "launchctl", args);
}

function runCommand(
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

function tryCommand(
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

function commandErrorText(err: unknown): string | undefined {
  if (!(err instanceof Error) || !("stderr" in err)) return undefined;
  const stderr = err.stderr;
  if (typeof stderr === "string") return stderr.trim();
  if (Buffer.isBuffer(stderr)) return stderr.toString("utf-8").trim();
  return undefined;
}

function commandStatus(
  deps: ResolvedGatewayServiceDeps,
  command: string,
  args: string[],
): string {
  const result = deps.spawnSync(command, args, { encoding: "utf-8" });
  if (result.error) return "unknown";
  const stdout = result.stdout === undefined ? "" : String(result.stdout).trim();
  return stdout || "unknown";
}

async function reapStaleGateway(pidPath: string): Promise<void> {
  const pid = findRunningGatewayPid(pidPath);
  if (pid === null) return;
  console.log(`[gateway-ctl] terminating prior gateway (PID ${pid})`);
  await terminateGateway(pid);
}

function installSystemd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): void {
  const paths = gatewayServicePaths(deps);
  if (!deps.existsSync(paths.unitDir)) deps.mkdirSync(paths.unitDir, { recursive: true });

  const unit = generateSystemdUnit({
    env: deps.env,
    homeDir: deps.homeDir,
    workspace: opts.workspace ?? deps.workspace,
  });
  deps.writeFileSync(paths.unitPath, unit, "utf-8");
  console.log(`wrote ${paths.unitPath}`);

  systemctl(deps, "daemon-reload");
  systemctl(deps, "enable", paths.serviceName);
  console.log(`${paths.serviceName} enabled`);
}

function uninstallSystemd(deps: ResolvedGatewayServiceDeps): void {
  const paths = gatewayServicePaths(deps);

  try {
    systemctl(deps, "stop", paths.serviceName);
  } catch {}
  try {
    systemctl(deps, "disable", paths.serviceName);
  } catch {}

  if (deps.existsSync(paths.unitPath)) {
    deps.unlinkSync(paths.unitPath);
    console.log(`removed ${paths.unitPath}`);
  }

  systemctl(deps, "daemon-reload");
  console.log(`${paths.serviceName} uninstalled`);
}

async function startSystemd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  const paths = gatewayServicePaths(deps);
  const existing = findRunningGatewayPid(opts.pidPath);
  if (existing !== null) {
    console.error(
      `${paths.serviceName} already running (PID ${existing}). Use 'shrimpy gateway restart' to replace it.`,
    );
    process.exit(1);
  }
  systemctl(deps, "start", paths.serviceName);
  console.log(`${paths.serviceName} started`);
}

async function stopSystemd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  const paths = gatewayServicePaths(deps);
  try {
    systemctl(deps, "stop", paths.serviceName);
  } catch {}
  await reapStaleGateway(opts.pidPath);
  console.log(`${paths.serviceName} stopped`);
}

async function restartSystemd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  const paths = gatewayServicePaths(deps);
  await reapStaleGateway(opts.pidPath);
  systemctl(deps, "restart", paths.serviceName);
  console.log(`${paths.serviceName} restarted`);
}

function launchdDomain(deps: ResolvedGatewayServiceDeps): string {
  if (deps.uid === undefined) {
    throw new Error("launchd gateway service management needs a numeric user id");
  }
  return `gui/${deps.uid}`;
}

function launchdTarget(deps: ResolvedGatewayServiceDeps): string {
  return `${launchdDomain(deps)}/${gatewayServicePaths(deps).launchdLabel}`;
}

function installLaunchd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): void {
  const paths = gatewayServicePaths(deps);
  deps.mkdirSync(paths.launchAgentDir, { recursive: true });
  deps.mkdirSync(dirname(paths.launchdLogPath), { recursive: true });
  deps.writeFileSync(
    paths.launchAgentPath,
    generateLaunchAgentPlist({
      env: deps.env,
      homeDir: deps.homeDir,
      logPath: paths.launchdLogPath,
      workspace: opts.workspace ?? deps.workspace,
      appRoot: deps.appRoot,
    }),
    "utf-8",
  );
  console.log(`wrote ${paths.launchAgentPath}`);
  console.log(`${paths.launchdLabel} installed`);
  console.log("start with: shrimpy gateway start");
}

function uninstallLaunchd(deps: ResolvedGatewayServiceDeps): void {
  tryCommand(deps, "launchctl", ["bootout", launchdTarget(deps)]);
  const paths = gatewayServicePaths(deps);
  if (deps.existsSync(paths.launchAgentPath)) {
    deps.unlinkSync(paths.launchAgentPath);
    console.log(`removed ${paths.launchAgentPath}`);
  }
  console.log(`${paths.launchdLabel} uninstalled`);
}

async function startLaunchd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  const paths = gatewayServicePaths(deps);
  if (!deps.existsSync(paths.launchAgentPath)) {
    console.error(`gateway LaunchAgent is not installed: ${paths.launchAgentPath}`);
    console.error("Run: shrimpy gateway install");
    process.exit(1);
  }

  const existing = findRunningGatewayPid(opts.pidPath);
  if (existing !== null) {
    console.error(
      `${paths.serviceName} already running (PID ${existing}). Use 'shrimpy gateway restart' to replace it.`,
    );
    process.exit(1);
  }

  try {
    launchctl(deps, "bootstrap", launchdDomain(deps), paths.launchAgentPath);
  } catch (err) {
    if (!isAlreadyBootstrapped(err)) throw err;
  }
  launchctl(deps, "kickstart", "-k", launchdTarget(deps));
  console.log(`${paths.serviceName} started (${paths.launchdLabel})`);
}

async function stopLaunchd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  const paths = gatewayServicePaths(deps);
  tryCommand(deps, "launchctl", ["bootout", launchdTarget(deps)]);
  await reapStaleGateway(opts.pidPath);
  console.log(`${paths.serviceName} stopped (${paths.launchdLabel})`);
}

async function restartLaunchd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  const paths = gatewayServicePaths(deps);
  if (!deps.existsSync(paths.launchAgentPath)) {
    console.error(`gateway LaunchAgent is not installed: ${paths.launchAgentPath}`);
    console.error("Run: shrimpy gateway install");
    process.exit(1);
  }

  tryCommand(deps, "launchctl", ["bootout", launchdTarget(deps)]);
  await reapStaleGateway(opts.pidPath);
  launchctl(deps, "bootstrap", launchdDomain(deps), paths.launchAgentPath);
  launchctl(deps, "kickstart", "-k", launchdTarget(deps));
  console.log(`${paths.serviceName} restarted (${paths.launchdLabel})`);
}

function isAlreadyBootstrapped(err: unknown): boolean {
  const text = commandErrorText(err)?.toLowerCase() ?? "";
  return text.includes("already") || text.includes("bootstrap failed: 5");
}

function unsupported(action: string, deps: ResolvedGatewayServiceDeps): void {
  console.error(`shrimpy gateway ${action} is not supported on ${deps.platform}.`);
  console.error("Run the gateway manually with: shrimpy-gateway");
  console.error("Inspect the workspace log with: shrimpy gateway logs");
  process.exit(1);
}

type Action = "install" | "uninstall" | "start" | "stop" | "restart";

const SYSTEMD_ACTIONS: Record<Action, (opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps) => void | Promise<void>> = {
  install: installSystemd,
  uninstall: (_opts, deps) => uninstallSystemd(deps),
  start: startSystemd,
  stop: stopSystemd,
  restart: restartSystemd,
};

const LAUNCHD_ACTIONS: Record<Action, (opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps) => void | Promise<void>> = {
  install: installLaunchd,
  uninstall: (_opts, deps) => uninstallLaunchd(deps),
  start: startLaunchd,
  stop: stopLaunchd,
  restart: restartLaunchd,
};

export async function gatewayCtl(
  action: string,
  opts: GatewayCtlOptions,
): Promise<void> {
  if (!isAction(action)) {
    console.error(`unknown gateway action: ${action}`);
    console.error(`valid actions: ${Object.keys(SYSTEMD_ACTIONS).join(", ")}`);
    process.exit(1);
  }

  const deps = {
    ...resolveDeps(opts.deps),
    ...(opts.workspace ? { workspace: opts.workspace } : {}),
  };
  const manager = gatewayServiceManager(deps.platform);
  const fn = manager === "systemd"
    ? SYSTEMD_ACTIONS[action]
    : manager === "launchd"
      ? LAUNCHD_ACTIONS[action]
      : undefined;
  if (!fn) {
    unsupported(action, deps);
    return;
  }
  await fn(opts, deps);
}

function isAction(action: string): action is Action {
  return action === "install" ||
    action === "uninstall" ||
    action === "start" ||
    action === "stop" ||
    action === "restart";
}

export function readGatewayServiceStatus(deps?: GatewayServiceDeps): GatewayServiceStatus {
  const resolved = resolveDeps(deps);
  const paths = gatewayServicePaths(resolved);
  const manager = gatewayServiceManager(resolved.platform);

  if (manager === "systemd") {
    return {
      manager,
      serviceName: paths.serviceName,
      active: commandStatus(resolved, "systemctl", ["--user", "is-active", paths.serviceName]),
      enabled: commandStatus(resolved, "systemctl", ["--user", "is-enabled", paths.serviceName]),
      definitionPath: paths.unitPath,
    };
  }

  if (manager === "launchd") {
    return {
      manager,
      serviceName: paths.launchdLabel,
      active: launchdActiveStatus(resolved),
      enabled: resolved.existsSync(paths.launchAgentPath) ? "installed" : "not installed",
      definitionPath: paths.launchAgentPath,
      serviceLogPath: paths.launchdLogPath,
    };
  }

  return {
    manager,
    serviceName: paths.serviceName,
    active: "unsupported",
    enabled: "unsupported",
    detail: `manual gateway management required on ${resolved.platform}`,
  };
}

function launchdActiveStatus(deps: ResolvedGatewayServiceDeps): string {
  const result = deps.spawnSync("launchctl", ["print", launchdTarget(deps)], {
    encoding: "utf-8",
  });
  if (result.error) return "unknown";
  if (result.status === 0) return "active";

  const output = [
    result.stdout === undefined ? "" : String(result.stdout),
    result.stderr === undefined ? "" : String(result.stderr),
  ].join("\n");
  if (/could not find service|no such process|service is not loaded/i.test(output)) {
    return "inactive";
  }
  return "inactive";
}

export function formatGatewayServiceSummary(status = readGatewayServiceStatus()): string {
  if (status.manager === "manual") return status.detail ?? "unsupported";
  return `${status.active} (${status.manager}, ${status.enabled})`;
}
