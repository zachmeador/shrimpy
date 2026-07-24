import {
  formatModelRef,
  validateModelPoliciesConfig,
  type ModelPoliciesConfig,
  type ModelPolicyConfig,
  type ModelSelectionConfig,
} from "./model.js";
import { editConfigFile } from "./store.js";
import { isRecord } from "../util/record.js";

export interface ModelPolicyMutationResult {
  configPath: string;
  policies: ModelPoliciesConfig;
}

export function editModelPolicies(
  workspace: string,
  edit: (policies: ModelPoliciesConfig) => void,
): ModelPolicyMutationResult {
  let policies: ModelPoliciesConfig = {};
  const { configPath } = editConfigFile(workspace, (raw) => {
    policies = cloneModelPolicies(raw.modelPolicies);
    edit(policies);
    validateModelPoliciesConfig(policies);
    raw.modelPolicies = policies;
  }, { missing: "error" });
  return { configPath, policies };
}

export function requireModelPolicy(
  policies: ModelPoliciesConfig,
  name: string,
): ModelPolicyConfig {
  const policy = policies[name];
  if (!policy) throw new Error(`model policy not found: ${name}`);
  return policy;
}

export function parseModelPolicyIndex(
  raw: string,
  maxInclusive: number,
): number {
  const index = Number(raw);
  if (!Number.isInteger(index) || index < 0 || index > maxInclusive) {
    throw new Error(`index must be an integer from 0 to ${maxInclusive}`);
  }
  return index;
}

export function uniqueModelCandidates(
  candidates: ModelSelectionConfig[],
): ModelSelectionConfig[] {
  const seen = new Set<string>();
  const unique: ModelSelectionConfig[] = [];
  for (const candidate of candidates) {
    const id = formatModelRef(candidate);
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(candidate);
  }
  return unique;
}

function cloneModelPolicies(raw: unknown): ModelPoliciesConfig {
  if (!isRecord(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw).map(([name, value]) => {
      const policy = value as Partial<ModelPolicyConfig>;
      return [
        name,
        {
          candidates: Array.isArray(policy.candidates)
            ? policy.candidates.map((candidate) => ({ ...candidate }))
            : [],
        },
      ];
    }),
  ) as ModelPoliciesConfig;
}
