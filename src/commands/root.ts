import { existsSync } from "node:fs";
import {
  primaryConfigPath,
} from "../config/index.js";
import {
  hasUsableCodingModelPolicyForWorkspace,
} from "../setup/readiness.js";

export async function shouldRunSetupBootstrapForRootShrimpy(
  workspace: string,
): Promise<boolean> {
  const configPath = primaryConfigPath(workspace);
  if (!existsSync(configPath)) return true;

  return !(await hasUsableCodingModelPolicyForWorkspace(workspace));
}
