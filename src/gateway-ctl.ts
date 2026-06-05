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
  findRunningGatewayPid,
  terminateGateway,
} from "./gateway/pid-file.js";

const SERVICE_NAME = "shrimpy-gateway";
const UNIT_FILE = `${SERVICE_NAME}.service`;
const LAUNCHD_LABEL = "io.github.zachmeador.shrimpy.gateway";
const LAUNCHD_PLIST = `${LAUNCHD_LABEL}.plist`;

export interface GatewayCtlOptions {
  pidPath: string;
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

export interface GatewayServiceDeps {
  platform?: string;
  homeDir?: string;
  uid?: number;
  env?: NodeJS.ProcessEnv;
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
  execFileSync: ExecFileSyncLike;
  spawnSync: SpawnSyncLike;
  existsSync: (path: string) => boolean;
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => unknown;
  unlinkSync: (path: string) => void;
  writeFileSync: (path: string, content: string, encoding: BufferEncoding) => void;
}

export type GatewayServiceManager = "systemd" | "launchd" | "manual";

export interface GatewayServicePaths {
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
  return {
    unitDir: join(resolved.homeDir, ".config", "systemd", "user"),
    unitPath: join(resolved.homeDir, ".config", "systemd", "user", UNIT_FILE),
    launchAgentDir: join(resolved.homeDir, "Library", "LaunchAgents"),
    launchAgentPath: join(resolved.homeDir, "Library", "LaunchAgents", LAUNCHD_PLIST),
    launchdLogPath: join(resolved.homeDir, "Library", "Logs", "Shrimpy", "gateway.launchd.log"),
  };
}

function nodePath(): string {
  return process.execPath;
}

function gatewayScript(): string {
  return join(import.meta.dirname, "gateway.js");
}

export function generateSystemdUnit(opts?: {
  node?: string;
  script?: string;
}): string {
  const node = opts?.node ?? nodePath();
  const script = opts?.script ?? gatewayScript();

  return `[Unit]
Description=shrimpy gateway
After=network.target

[Service]
Type=simple
ExecStart=${node} ${script}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

export function generateLaunchAgentPlist(opts?: {
  label?: string;
  node?: string;
  script?: string;
  homeDir?: string;
  logPath?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const label = opts?.label ?? LAUNCHD_LABEL;
  const node = opts?.node ?? nodePath();
  const script = opts?.script ?? gatewayScript();
  const homeDir = opts?.homeDir ?? homedir();
  const logPath = opts?.logPath ?? join(homeDir, "Library", "Logs", "Shrimpy", "gateway.launchd.log");
  const pathValue = opts?.env?.PATH;
  const environment = pathValue
    ? `
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xmlEscape(pathValue)}</string>
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

function installSystemd(deps: ResolvedGatewayServiceDeps): void {
  const paths = gatewayServicePaths(deps);
  if (!deps.existsSync(paths.unitDir)) deps.mkdirSync(paths.unitDir, { recursive: true });

  const unit = generateSystemdUnit();
  deps.writeFileSync(paths.unitPath, unit, "utf-8");
  console.log(`wrote ${paths.unitPath}`);

  systemctl(deps, "daemon-reload");
  systemctl(deps, "enable", SERVICE_NAME);
  console.log(`${SERVICE_NAME} enabled`);
}

function uninstallSystemd(deps: ResolvedGatewayServiceDeps): void {
  const paths = gatewayServicePaths(deps);

  try {
    systemctl(deps, "stop", SERVICE_NAME);
  } catch {}
  try {
    systemctl(deps, "disable", SERVICE_NAME);
  } catch {}

  if (deps.existsSync(paths.unitPath)) {
    deps.unlinkSync(paths.unitPath);
    console.log(`removed ${paths.unitPath}`);
  }

  systemctl(deps, "daemon-reload");
  console.log(`${SERVICE_NAME} uninstalled`);
}

async function startSystemd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  const existing = findRunningGatewayPid(opts.pidPath);
  if (existing !== null) {
    console.error(
      `${SERVICE_NAME} already running (PID ${existing}). Use 'shrimpy gateway restart' to replace it.`,
    );
    process.exit(1);
  }
  systemctl(deps, "start", SERVICE_NAME);
  console.log(`${SERVICE_NAME} started`);
}

async function stopSystemd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  try {
    systemctl(deps, "stop", SERVICE_NAME);
  } catch {}
  await reapStaleGateway(opts.pidPath);
  console.log(`${SERVICE_NAME} stopped`);
}

async function restartSystemd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  await reapStaleGateway(opts.pidPath);
  systemctl(deps, "restart", SERVICE_NAME);
  console.log(`${SERVICE_NAME} restarted`);
}

function launchdDomain(deps: ResolvedGatewayServiceDeps): string {
  if (deps.uid === undefined) {
    throw new Error("launchd gateway service management needs a numeric user id");
  }
  return `gui/${deps.uid}`;
}

function launchdTarget(deps: ResolvedGatewayServiceDeps): string {
  return `${launchdDomain(deps)}/${LAUNCHD_LABEL}`;
}

function installLaunchd(deps: ResolvedGatewayServiceDeps): void {
  const paths = gatewayServicePaths(deps);
  deps.mkdirSync(paths.launchAgentDir, { recursive: true });
  deps.mkdirSync(dirname(paths.launchdLogPath), { recursive: true });
  deps.writeFileSync(
    paths.launchAgentPath,
    generateLaunchAgentPlist({
      env: deps.env,
      homeDir: deps.homeDir,
      logPath: paths.launchdLogPath,
    }),
    "utf-8",
  );
  console.log(`wrote ${paths.launchAgentPath}`);
  console.log(`${LAUNCHD_LABEL} installed`);
  console.log("start with: shrimpy gateway start");
}

function uninstallLaunchd(deps: ResolvedGatewayServiceDeps): void {
  tryCommand(deps, "launchctl", ["bootout", launchdTarget(deps)]);
  const paths = gatewayServicePaths(deps);
  if (deps.existsSync(paths.launchAgentPath)) {
    deps.unlinkSync(paths.launchAgentPath);
    console.log(`removed ${paths.launchAgentPath}`);
  }
  console.log(`${LAUNCHD_LABEL} uninstalled`);
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
      `${SERVICE_NAME} already running (PID ${existing}). Use 'shrimpy gateway restart' to replace it.`,
    );
    process.exit(1);
  }

  try {
    launchctl(deps, "bootstrap", launchdDomain(deps), paths.launchAgentPath);
  } catch (err) {
    if (!isAlreadyBootstrapped(err)) throw err;
  }
  launchctl(deps, "kickstart", "-k", launchdTarget(deps));
  console.log(`${SERVICE_NAME} started (${LAUNCHD_LABEL})`);
}

async function stopLaunchd(opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps): Promise<void> {
  tryCommand(deps, "launchctl", ["bootout", launchdTarget(deps)]);
  await reapStaleGateway(opts.pidPath);
  console.log(`${SERVICE_NAME} stopped (${LAUNCHD_LABEL})`);
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
  console.log(`${SERVICE_NAME} restarted (${LAUNCHD_LABEL})`);
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
  install: (_opts, deps) => installSystemd(deps),
  uninstall: (_opts, deps) => uninstallSystemd(deps),
  start: startSystemd,
  stop: stopSystemd,
  restart: restartSystemd,
};

const LAUNCHD_ACTIONS: Record<Action, (opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps) => void | Promise<void>> = {
  install: (_opts, deps) => installLaunchd(deps),
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

  const deps = resolveDeps(opts.deps);
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
      serviceName: SERVICE_NAME,
      active: commandStatus(resolved, "systemctl", ["--user", "is-active", SERVICE_NAME]),
      enabled: commandStatus(resolved, "systemctl", ["--user", "is-enabled", SERVICE_NAME]),
      definitionPath: paths.unitPath,
    };
  }

  if (manager === "launchd") {
    return {
      manager,
      serviceName: LAUNCHD_LABEL,
      active: launchdActiveStatus(resolved),
      enabled: resolved.existsSync(paths.launchAgentPath) ? "installed" : "not installed",
      definitionPath: paths.launchAgentPath,
      serviceLogPath: paths.launchdLogPath,
    };
  }

  return {
    manager,
    serviceName: SERVICE_NAME,
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
