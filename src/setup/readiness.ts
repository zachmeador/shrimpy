import { existsSync } from "node:fs";
import type { AppRuntime } from "../app/index.js";
import {
  createAppRuntime,
} from "../app/index.js";
import {
  loadConfigForWorkspace,
  primaryConfigPath,
} from "../config/index.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import type { SessionBootstrap } from "../sessions/bootstrap.js";
import {
  resolveModelPolicy,
} from "../sessions/models.js";

export const TUI_SETUP_REQUIRED_MESSAGE =
  "Shrimpy needs a usable coding model policy before opening the TUI. Run: shrimpy setup";

export async function hasUsableCodingModelPolicyForWorkspace(
  workspace: string,
): Promise<boolean> {
  if (!existsSync(primaryConfigPath(workspace))) return false;

  try {
    const config = loadConfigForWorkspace(workspace);
    const runtime = createAppRuntime(config);
    const bootstrap = await runtime.createBootstrap();
    return hasUsableCodingModelPolicy(bootstrap);
  } catch {
    return false;
  }
}

export function hasUsableCodingModelPolicy(
  bootstrap: SessionBootstrap,
): boolean {
  return Boolean(
    resolveModelPolicy(bootstrap, DEFAULT_MODEL_POLICY, "default").selected,
  );
}

export async function assertUsableCodingModelPolicyForTui(
  runtime: AppRuntime,
): Promise<void> {
  const bootstrap = await runtime.createBootstrap();
  if (!hasUsableCodingModelPolicy(bootstrap)) {
    throw new Error(TUI_SETUP_REQUIRED_MESSAGE);
  }
}
