import type { SessionBootstrap } from "./bootstrap.js";
import {
  formatModelSelection,
  type ModelSelectionConfig,
} from "../config/index.js";

interface ModelCandidate {
  id?: string;
  name?: string;
}

export function resolveModel(
  bootstrap: SessionBootstrap,
  provider?: string,
  model?: string,
  defaultModel?: ModelSelectionConfig,
) {
  const { modelRegistry } = bootstrap;

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
    if (defaultModel.provider) {
      const found = modelRegistry.find(defaultModel.provider, defaultModel.id);
      if (!found) {
        throw new Error(`default model not found: ${formatModelSelection(defaultModel)}`);
      }
      return found;
    }

    const found = modelRegistry
      .getAvailable()
      .find((candidate: ModelCandidate) => {
        return candidate.id === defaultModel.id || candidate.name === defaultModel.id;
      });
    if (!found) {
      throw new Error(`default model not found: ${defaultModel.id}`);
    }
    return found;
  }

  return undefined;
}
