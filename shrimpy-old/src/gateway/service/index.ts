import { LAUNCHD_ACTIONS } from "./launchd.js";
import { SYSTEMD_ACTIONS } from "./systemd.js";
import { gatewayServiceManager, resolveGatewayServiceDeps, type GatewayCtlOptions, type GatewayServiceAction, type ResolvedGatewayServiceDeps } from "./shared.js";

export async function gatewayCtl(action: string, opts: GatewayCtlOptions): Promise<void> {
  if (!isGatewayServiceAction(action)) {
    console.error(`unknown gateway action: ${action}`);
    console.error(`valid actions: ${Object.keys(SYSTEMD_ACTIONS).join(", ")}`);
    process.exit(1);
  }
  const deps = { ...resolveGatewayServiceDeps(opts.deps), ...(opts.workspace ? { workspace: opts.workspace } : {}) };
  const manager = gatewayServiceManager(deps.platform);
  const fn = manager === "systemd" ? SYSTEMD_ACTIONS[action] : manager === "launchd" ? LAUNCHD_ACTIONS[action] : undefined;
  if (!fn) { unsupported(action, deps); return; }
  await fn(opts, deps);
}

function isGatewayServiceAction(action: string): action is GatewayServiceAction {
  return action === "install" || action === "uninstall" || action === "start" || action === "stop" || action === "restart";
}

function unsupported(action: string, deps: ResolvedGatewayServiceDeps): void {
  console.error(`shrimpy gateway ${action} is not supported on ${deps.platform}.`);
  console.error("Run the gateway manually with: shrimpy-gateway");
  console.error("Inspect the workspace log with: shrimpy gateway logs");
  process.exit(1);
}

export { generateLaunchAgentPlist } from "./launchd.js";
export { generateSystemdUnit } from "./systemd.js";
export { formatGatewayServiceSummary, readGatewayServiceStatus, type GatewayServiceStatus } from "./status.js";
export { gatewayServiceManager, gatewayServicePaths, type GatewayServiceAction, type GatewayServiceDeps, type GatewayServiceManager, type GatewayServicePaths } from "./shared.js";
