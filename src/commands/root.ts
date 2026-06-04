import { existsSync } from "node:fs";
import {
  primaryConfigPath,
} from "../config/index.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import { readJsonFileStrict } from "../util/json-file.js";

export async function shouldRunSetupBootstrapForRootShrimpy(
  workspace: string,
): Promise<boolean> {
  const configPath = primaryConfigPath(workspace);
  if (!existsSync(configPath)) return true;

  const raw = readJsonFileStrict(
    configPath,
    (parsed) => parsed as Record<string, unknown>,
  );
  if (!hasCodingPolicy(raw.modelPolicies)) return true;
  return false;
}

function hasCodingPolicy(rawPolicies: unknown): boolean {
  if (!isRecord(rawPolicies)) return false;
  const policy = rawPolicies[DEFAULT_MODEL_POLICY];
  if (!isRecord(policy) || !Array.isArray(policy.candidates)) return false;
  return policy.candidates.some((candidate) => {
    return isRecord(candidate) &&
      typeof candidate.provider === "string" &&
      Boolean(candidate.provider) &&
      typeof candidate.id === "string" &&
      Boolean(candidate.id);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
