import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { pathWithShrimpyRuntimeBin, resolveShrimpyRuntimeEnvironment } from "../../app/environment.js";
import { WORKSPACE_ENV_VAR } from "../../workspace/location.js";
import { findRunningGatewayPid } from "../pid-file.js";
import { commandErrorText, gatewayScript, gatewayServicePaths, nodePath, reapStaleGateway, runCommand, tryCommand, type GatewayCtlOptions, type ResolvedGatewayServiceDeps } from "./shared.js";
import type { GatewayServiceAction } from "./shared.js";

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


function launchctl(deps: ResolvedGatewayServiceDeps, ...args: string[]): string {
  return runCommand(deps, "launchctl", args);
}

function launchdDomain(deps: ResolvedGatewayServiceDeps): string {
  if (deps.uid === undefined) {
    throw new Error("launchd gateway service management needs a numeric user id");
  }
  return `gui/${deps.uid}`;
}

export function launchdTarget(deps: ResolvedGatewayServiceDeps): string {
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


export const LAUNCHD_ACTIONS: Record<GatewayServiceAction, (opts: GatewayCtlOptions, deps: ResolvedGatewayServiceDeps) => void | Promise<void>> = {
  install: installLaunchd,
  uninstall: (_opts, deps) => uninstallLaunchd(deps),
  start: startLaunchd,
  stop: stopLaunchd,
  restart: restartLaunchd,
};
