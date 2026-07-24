import { homedir } from "node:os";
import { pathWithShrimpyRuntimeBin } from "../../app/environment.js";
import { WORKSPACE_ENV_VAR } from "../../workspace/location.js";
import { findRunningGatewayPid } from "../pid-file.js";
import { gatewayScript, gatewayServicePaths, nodePath, reapStaleGateway, runCommand, type GatewayCtlOptions, type ResolvedGatewayServiceDeps } from "./shared.js";
import type { GatewayServiceAction } from "./shared.js";

function systemctl(
  deps: ResolvedGatewayServiceDeps,
  ...args: string[]
): string {
  return runCommand(deps, "systemctl", ["--user", ...args]);
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


export const SYSTEMD_ACTIONS: Record<GatewayServiceAction, (opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps) => void | Promise<void>> = {
  install: installSystemd,
  uninstall: (_opts, deps) => uninstallSystemd(deps),
  start: startSystemd,
  stop: stopSystemd,
  restart: restartSystemd,
};
