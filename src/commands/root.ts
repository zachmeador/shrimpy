import { existsSync } from "node:fs";
import {
  loadConfigForWorkspace,
  primaryConfigPath,
} from "../config/index.js";
import { createAppRuntime } from "../app/index.js";
import { resolveModelDetailed } from "../sessions/models.js";

export async function shouldRunSetupBootstrapForRootShrimpy(
  workspace: string,
): Promise<boolean> {
  const configPath = primaryConfigPath(workspace);
  if (!existsSync(configPath)) return true;

  return !(await hasUsableRootTuiModel(workspace));
}

async function hasUsableRootTuiModel(workspace: string): Promise<boolean> {
  try {
    const config = loadConfigForWorkspace(workspace);
    const runtime = createAppRuntime(config);
    const agent = runtime.getAgent();
    const bootstrap = await runtime.createBootstrap({ agentId: agent.id });
    const resolution = resolveModelDetailed(
      bootstrap,
      undefined,
      undefined,
      agent.modelPolicy,
      { allowMissingDefault: true },
    );
    return Boolean(resolution.model);
  } catch {
    return false;
  }
}
