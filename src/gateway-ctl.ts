/**
 * Manage shrimpy gateway as a systemd user service.
 *
 * shrimpy gateway install   — write unit file, enable service
 * shrimpy gateway uninstall — disable service, remove unit file
 * shrimpy gateway start     — start the service (refuses if one is already alive)
 * shrimpy gateway stop      — stop the service and reap any orphan
 * shrimpy gateway restart   — kill any prior gateway, then start fresh
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  findRunningGatewayPid,
  terminateGateway,
} from "./gateway/pid-file.js";

const SERVICE_NAME = "shrimpy-gateway";
const UNIT_FILE = `${SERVICE_NAME}.service`;

export interface GatewayCtlOptions {
  pidPath: string;
}

function unitDir(): string {
  return join(homedir(), ".config", "systemd", "user");
}

function unitPath(): string {
  return join(unitDir(), UNIT_FILE);
}

function nodePath(): string {
  return process.execPath;
}

function gatewayScript(): string {
  return join(import.meta.dirname, "gateway.js");
}

function generateUnit(): string {
  const node = nodePath();
  const script = gatewayScript();

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

function systemctl(...args: string[]): string {
  try {
    return execFileSync("systemctl", ["--user", ...args], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const stderr = err instanceof Error && "stderr" in err && typeof err.stderr === "string"
      ? err.stderr.trim()
      : undefined;
    if (stderr) console.error(stderr);
    throw err;
  }
}

async function reapStaleGateway(pidPath: string): Promise<void> {
  const pid = findRunningGatewayPid(pidPath);
  if (pid === null) return;
  console.log(`[gateway-ctl] terminating prior gateway (PID ${pid})`);
  await terminateGateway(pid);
}

function install(): void {
  const dir = unitDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const path = unitPath();
  const unit = generateUnit();
  writeFileSync(path, unit, "utf-8");
  console.log(`wrote ${path}`);

  systemctl("daemon-reload");
  systemctl("enable", SERVICE_NAME);
  console.log(`${SERVICE_NAME} enabled`);
}

function uninstall(): void {
  const path = unitPath();

  try {
    systemctl("stop", SERVICE_NAME);
  } catch {}
  try {
    systemctl("disable", SERVICE_NAME);
  } catch {}

  if (existsSync(path)) {
    unlinkSync(path);
    console.log(`removed ${path}`);
  }

  systemctl("daemon-reload");
  console.log(`${SERVICE_NAME} uninstalled`);
}

async function start(opts: GatewayCtlOptions): Promise<void> {
  const existing = findRunningGatewayPid(opts.pidPath);
  if (existing !== null) {
    console.error(
      `${SERVICE_NAME} already running (PID ${existing}). Use 'shrimpy gateway restart' to replace it.`,
    );
    process.exit(1);
  }
  systemctl("start", SERVICE_NAME);
  console.log(`${SERVICE_NAME} started`);
}

async function stop(opts: GatewayCtlOptions): Promise<void> {
  try {
    systemctl("stop", SERVICE_NAME);
  } catch {}
  await reapStaleGateway(opts.pidPath);
  console.log(`${SERVICE_NAME} stopped`);
}

async function restart(opts: GatewayCtlOptions): Promise<void> {
  await reapStaleGateway(opts.pidPath);
  systemctl("restart", SERVICE_NAME);
  console.log(`${SERVICE_NAME} restarted`);
}

const ACTIONS: Record<string, (opts: GatewayCtlOptions) => void | Promise<void>> = {
  install,
  uninstall,
  start,
  stop,
  restart,
};

export async function gatewayCtl(
  action: string,
  opts: GatewayCtlOptions,
): Promise<void> {
  const fn = ACTIONS[action];
  if (!fn) {
    console.error(`unknown gateway action: ${action}`);
    console.error(`valid actions: ${Object.keys(ACTIONS).join(", ")}`);
    process.exit(1);
  }
  await fn(opts);
}
