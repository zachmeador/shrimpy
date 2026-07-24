import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";
import {
  WORKSPACE_ENV_VAR,
  type WorkspaceResolution,
  type WorkspaceResolutionSource,
} from "../workspace/location.js";
import { createWorkspacePaths } from "../workspace/paths.js";
import { projectRoot } from "./project-root.js";

export interface ShrimpyRuntimeEnvironment {
  workspacePath: string;
  appRoot: string;
  cliPath: string;
  gatewayScriptPath: string;
  webServerPath: string;
  binDir: string;
  serviceId: string;
  serviceName: string;
  launchdLabel: string;
  resolutionSource?: WorkspaceResolutionSource;
  resolutionSourcePath?: string;
}

export interface ShrimpyRuntimeDiagnosticsOptions {
  workspaceResolution?: WorkspaceResolution;
  shrimpyCommandPath?: string;
  gatewayServiceName?: string;
  currentCliPath?: string;
}

type ShimName = "shrimpy" | "shrimpy-gateway" | "shrimpy-web";

export function resolveShrimpyRuntimeEnvironment(
  workspacePath: string,
  opts: {
    appRoot?: string;
    resolutionSource?: WorkspaceResolutionSource;
    resolutionSourcePath?: string;
  } = {},
): ShrimpyRuntimeEnvironment {
  const workspace = resolve(workspacePath);
  const appRoot = resolve(opts.appRoot ?? projectRoot);
  const paths = createWorkspacePaths(workspace);
  const serviceId = createHash("sha256")
    .update(appRoot)
    .update("\0")
    .update(workspace)
    .digest("hex")
    .slice(0, 12);
  return {
    workspacePath: workspace,
    appRoot,
    cliPath: join(appRoot, "dist", "cli.js"),
    gatewayScriptPath: join(appRoot, "dist", "gateway.js"),
    webServerPath: join(appRoot, "dist", "web", "server.js"),
    binDir: paths.runtimeBinDir,
    serviceId,
    serviceName: `shrimpy-gateway-${serviceId}`,
    launchdLabel: `io.github.zachmeador.shrimpy.gateway.${serviceId}`,
    ...(opts.resolutionSource ? { resolutionSource: opts.resolutionSource } : {}),
    ...(opts.resolutionSourcePath ? { resolutionSourcePath: opts.resolutionSourcePath } : {}),
  };
}

export function ensureShrimpyRuntimeEnvironment(
  workspacePath: string,
): ShrimpyRuntimeEnvironment {
  const env = resolveShrimpyRuntimeEnvironment(workspacePath);
  mkdirSync(env.binDir, { recursive: true });
  writeShim(env, "shrimpy", env.cliPath);
  writeShim(env, "shrimpy-gateway", env.gatewayScriptPath);
  writeShim(env, "shrimpy-web", env.webServerPath);
  return env;
}

export function applyShrimpyRuntimeProcessEnv(
  workspacePath: string,
  env: NodeJS.ProcessEnv = process.env,
): ShrimpyRuntimeEnvironment {
  const runtimeEnv = ensureShrimpyRuntimeEnvironment(workspacePath);
  env[WORKSPACE_ENV_VAR] = runtimeEnv.workspacePath;
  env.PATH = pathWithShrimpyRuntimeBin(env.PATH, runtimeEnv);
  return runtimeEnv;
}

export function shrimpyRuntimeChildEnv(
  workspacePath: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const runtimeEnv = ensureShrimpyRuntimeEnvironment(workspacePath);
  return {
    ...baseEnv,
    [WORKSPACE_ENV_VAR]: runtimeEnv.workspacePath,
    PATH: pathWithShrimpyRuntimeBin(baseEnv.PATH, runtimeEnv),
  };
}

export function resolveShrimpyCommand(workspacePath: string): string {
  const result = spawnSync("sh", ["-lc", "command -v shrimpy"], {
    encoding: "utf-8",
    env: shrimpyRuntimeChildEnv(workspacePath),
  });
  if (result.error || result.status !== 0) return "(not found)";
  return String(result.stdout).trim() || "(not found)";
}

export function pathWithShrimpyRuntimeBin(
  pathValue: string | undefined,
  envOrWorkspace: ShrimpyRuntimeEnvironment | string,
  homeDir: string = homedir(),
): string {
  const runtimeEnv = typeof envOrWorkspace === "string"
    ? resolveShrimpyRuntimeEnvironment(envOrWorkspace)
    : envOrWorkspace;
  const homeBin = join(homeDir, ".local", "bin");
  const parts = [
    runtimeEnv.binDir,
    ...(pathValue ? pathValue.split(delimiter) : []),
    homeBin,
  ].filter((part) => part.length > 0);
  return [...new Set(parts)].join(delimiter);
}

export function collectShrimpyRuntimeWarnings(
  env: ShrimpyRuntimeEnvironment,
  opts: ShrimpyRuntimeDiagnosticsOptions = {},
): string[] {
  const warnings: string[] = [];
  const expectedCommand = join(env.binDir, "shrimpy");

  if (
    opts.workspaceResolution &&
    resolve(opts.workspaceResolution.workspace) !== env.workspacePath
  ) {
    const source = opts.workspaceResolution.sourcePath
      ? `${opts.workspaceResolution.source} (${opts.workspaceResolution.sourcePath})`
      : opts.workspaceResolution.source;
    warnings.push(
      `resolved workspace from ${source} is ${opts.workspaceResolution.workspace}, but this runtime uses ${env.workspacePath}`,
    );
  }

  if (
    opts.shrimpyCommandPath &&
    normalizedPath(opts.shrimpyCommandPath) !== normalizedPath(expectedCommand)
  ) {
    warnings.push(
      `bare shrimpy resolves to ${opts.shrimpyCommandPath}, expected ${expectedCommand}`,
    );
  }

  if (
    opts.currentCliPath &&
    basename(opts.currentCliPath) === "cli.js" &&
    normalizedPath(opts.currentCliPath) !== normalizedPath(env.cliPath)
  ) {
    warnings.push(`current CLI is ${opts.currentCliPath}, expected ${env.cliPath}`);
  }

  if (
    opts.gatewayServiceName &&
    opts.gatewayServiceName !== env.serviceName &&
    opts.gatewayServiceName !== env.launchdLabel
  ) {
    warnings.push(
      `gateway service is ${opts.gatewayServiceName}, expected ${env.serviceName} or ${env.launchdLabel}`,
    );
  }

  return warnings;
}

function writeShim(
  env: ShrimpyRuntimeEnvironment,
  name: ShimName,
  scriptPath: string,
): void {
  const path = join(env.binDir, name);
  const content = [
    "#!/bin/sh",
    `exec ${shellQuote(process.execPath)} ${shellQuote(scriptPath)} --workspace ${shellQuote(
      env.workspacePath,
    )} "$@"`,
    "",
  ].join("\n");
  if (!existsSync(path) || readFileSync(path, "utf-8") !== content) {
    writeFileSync(path, content, "utf-8");
  }
  chmodSync(path, 0o755);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function normalizedPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}
