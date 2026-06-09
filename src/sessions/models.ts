import type { Api, Model } from "@earendil-works/pi-ai";
import type { SessionBootstrap } from "./bootstrap.js";
import {
  DEFAULT_MODEL_POLICY,
  formatModelSelection,
  hasConfiguredAuth,
  toModelRef,
  type ModelRef,
} from "../config/model.js";

interface ModelCandidate {
  id?: string;
  name?: string;
}

interface ModelPolicyCandidateResolution extends ModelRef {
  usable: boolean;
  selected?: boolean;
  reason?: string;
}

type ModelPolicySource = "cli-policy" | "agent" | "default";
type ModelResolutionSource =
  | "cli"
  | "policy"
  | "registry-fallback"
  | "saved-session"
  | "session-switch"
  | "missing";

export interface ModelPolicyResolution {
  name: string;
  source: ModelPolicySource;
  candidates: ModelPolicyCandidateResolution[];
  selected?: ModelRef;
  problems: string[];
}

export interface ModelResolution {
  source: ModelResolutionSource;
  model?: Model<Api>;
  modelRef?: ModelRef;
  policy?: ModelPolicyResolution;
  problems: string[];
}

interface ResolveModelOptions {
  modelPolicy?: string;
  allowMissingDefault?: boolean;
  allowRegistryFallback?: boolean;
  missingMessage?: string;
}

export function resolveModel(
  bootstrap: SessionBootstrap,
  provider?: string,
  model?: string,
  defaultModelPolicy?: string,
  opts?: ResolveModelOptions,
): Model<Api> | undefined {
  const resolution = resolveModelDetailed(bootstrap, provider, model, defaultModelPolicy, opts);
  if (resolution.model || opts?.allowMissingDefault) return resolution.model;
  throw new Error(resolution.problems[0] ?? opts?.missingMessage ?? "model is unresolved");
}

export function resolveModelDetailed(
  bootstrap: SessionBootstrap,
  provider?: string,
  model?: string,
  defaultModelPolicy?: string,
  opts?: ResolveModelOptions,
): ModelResolution {
  const { modelRegistry } = bootstrap;

  if (provider && !model) {
    throw new Error("--provider requires --model");
  }

  if (provider && model) {
    const found = modelRegistry.find(provider, model);
    if (!found) {
      throw new Error(`model not found: ${provider}/${model}`);
    }
    return {
      source: "cli",
      model: found,
      modelRef: toModelRef(found),
      problems: [],
    };
  }

  if (model) {
    const found = modelRegistry
      .getAvailable()
      .find((candidate: ModelCandidate) => {
        return candidate.id === model || candidate.name === model;
      });
    if (!found) {
      throw new Error(`model not found: ${model}`);
    }
    return {
      source: "cli",
      model: found,
      modelRef: toModelRef(found),
      problems: [],
    };
  }

  const policyName = opts?.modelPolicy ?? defaultModelPolicy ?? DEFAULT_MODEL_POLICY;
  const policySource = opts?.modelPolicy
    ? "cli-policy"
    : defaultModelPolicy
      ? "agent"
      : "default";
  const policy = resolveModelPolicy(bootstrap, policyName, policySource);
  if (policy.selected) {
    const selected = modelRegistry.find(policy.selected.provider, policy.selected.id);
    if (selected) {
      return {
        source: "policy",
        model: selected,
        modelRef: toModelRef(selected),
        policy,
        problems: [],
      };
    }
  }

  if (opts?.allowRegistryFallback) {
    const available = modelRegistry.getAvailable();
    if (available.length > 0) {
      return {
        source: "registry-fallback",
        model: available[0],
        modelRef: toModelRef(available[0]),
        policy,
        problems: policy.problems,
      };
    }
  }

  const problems = policy.problems.length > 0
    ? policy.problems
    : [formatMissingModelPolicyMessage(policyName)];
  if (opts?.allowMissingDefault) {
    return {
      source: "missing",
      policy,
      problems,
    };
  }
  return {
    source: "missing",
    policy,
    problems: [opts?.missingMessage ?? problems[0] ?? "model is unresolved"],
  };
}

export function resolveModelPolicy(
  bootstrap: SessionBootstrap,
  policyName: string,
  source: ModelPolicySource = "default",
): ModelPolicyResolution {
  const policy = bootstrap.config?.modelPolicies?.[policyName];
  if (!policy) {
    return {
      name: policyName,
      source,
      candidates: [],
      problems: [formatMissingModelPolicyMessage(policyName)],
    };
  }

  const candidates: ModelPolicyCandidateResolution[] = [];
  const problems: string[] = [];
  let selected: ModelRef | undefined;

  for (const candidate of policy.candidates) {
    if (selected) {
      candidates.push({
        ...candidate,
        usable: false,
        reason: "not checked; earlier candidate selected",
      });
      continue;
    }

    const found = bootstrap.modelRegistry.find(candidate.provider, candidate.id);
    if (!found) {
      const reason = `model not found: ${formatModelSelection(candidate)}`;
      candidates.push({ ...candidate, usable: false, reason });
      problems.push(reason);
      continue;
    }

    if (!hasConfiguredAuth(bootstrap.modelRegistry, found)) {
      const reason = `model auth not configured: ${formatModelSelection(candidate)}`;
      candidates.push({ ...candidate, usable: false, reason });
      problems.push(reason);
      continue;
    }

    selected = toModelRef(found);
    candidates.push({ ...selected, usable: true, selected: true });
  }

  return {
    name: policyName,
    source,
    candidates,
    selected,
    problems: selected
      ? []
      : problems.length > 0
        ? problems
        : [`model policy ${policyName} has no usable candidates`],
  };
}

export function formatMissingAgentModelPolicyMessage(agentId: string): string {
  return `agent ${agentId} has no usable model policy. Configure one with: shrimpy agent set ${agentId} --model-policy <name>`;
}

export function formatMissingModelPolicyMessage(policyName: string): string {
  return `model policy ${policyName} is not configured. Configure it with: shrimpy models policies set ${policyName} --candidate <provider>/<model>`;
}
