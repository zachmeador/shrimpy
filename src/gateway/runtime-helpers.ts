import { existsSync, mkdirSync } from "node:fs";
import type { AppRuntime } from "../app/runtime.js";
import type { SessionBootstrap } from "../sessions/index.js";

export function logGatewayStartup(runtime: AppRuntime): void {
  console.log(`[gateway] workspace: ${runtime.paths.workspace}`);
  console.log(
    `[gateway] agents: ${runtime.resolved.agents.map((agent) => agent.id).join(", ")}`,
  );
}

export function ensureGatewayDirectories(runtime: AppRuntime): void {
  for (const dir of [
    runtime.paths.agentsDir,
    runtime.paths.profileDir,
    runtime.paths.docsDir,
    runtime.paths.frameworkDir,
    runtime.paths.stateDir,
    runtime.paths.runtimeDir,
    runtime.paths.runtimeCursorsDir,
    runtime.paths.runtimeContextDir,
    runtime.paths.runtimePidsDir,
    runtime.paths.piStateDir,
    runtime.paths.channelsDir,
    runtime.paths.mediaDir,
    runtime.paths.logsDir,
  ]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}

export async function createGatewayBootstraps(
  runtime: AppRuntime,
): Promise<Map<string, SessionBootstrap>> {
  const bootstraps = new Map<string, SessionBootstrap>();
  for (const agent of runtime.resolved.agents) {
    bootstraps.set(
      agent.id,
      await runtime.createBootstrap({
        agentId: agent.id,
        cwd: runtime.paths.workspace,
      }),
    );
  }
  return bootstraps;
}
