import { launchdTarget } from "./launchd.js";
import { commandStatus, gatewayServiceManager, gatewayServicePaths, resolveGatewayServiceDeps, type GatewayServiceDeps, type GatewayServiceManager, type ResolvedGatewayServiceDeps } from "./shared.js";

export interface GatewayServiceStatus {
  manager: GatewayServiceManager;
  serviceName: string;
  active: string;
  enabled: string;
  definitionPath?: string;
  serviceLogPath?: string;
  detail?: string;
}

export function readGatewayServiceStatus(deps?: GatewayServiceDeps): GatewayServiceStatus {
  const resolved = resolveGatewayServiceDeps(deps);
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
