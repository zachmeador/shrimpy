import type { Api, Model } from "@earendil-works/pi-ai";
import type { SessionBootstrap } from "./bootstrap.js";
import {
  formatModelSelection,
  type ModelSelectionConfig,
} from "../config/index.js";

interface ModelCandidate {
  id?: string;
  name?: string;
}

export interface ResolveModelOptions {
  allowMissingDefault?: boolean;
  allowRegistryFallback?: boolean;
  missingMessage?: string;
}

export function resolveModel(
  bootstrap: SessionBootstrap,
  provider?: string,
  model?: string,
  defaultModel?: ModelSelectionConfig,
  opts?: ResolveModelOptions,
): Model<Api> | undefined {
  const { modelRegistry } = bootstrap;

  if (provider && !model) {
    throw new Error("--provider requires --model");
  }

  if (provider && model) {
    const found = modelRegistry.find(provider, model);
    if (!found) {
      throw new Error(`model not found: ${provider}/${model}`);
    }
    return found;
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
    return found;
  }

  if (defaultModel) {
    const found = modelRegistry.find(defaultModel.provider, defaultModel.id);
    if (!found) {
      throw new Error(`default model not found: ${formatModelSelection(defaultModel)}`);
    }
    return found;
  }

  if (opts?.allowRegistryFallback) {
    const available = modelRegistry.getAvailable();
    if (available.length > 0) return available[0];
  }

  if (opts?.allowMissingDefault) {
    return undefined;
  }

  throw new Error(opts?.missingMessage ?? "agent has no default model");
}

export function formatMissingAgentModelMessage(agentId: string): string {
  return `agent ${agentId} has no default model. Set one with: shrimpy agent set ${agentId} --provider <provider> --model <model>`;
}
