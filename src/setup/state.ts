import { existsSync } from "node:fs";
import {
  primaryConfigPath,
} from "../config/index.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import {
  hasSetupAgentContexts,
  loadRawSetupConfig,
  readPolicyState,
  resolvePolicyAgainstRawConfig,
} from "./coding-policy.js";
import {
  listAvailableSetupModels,
  type SetupModelView,
} from "./model-access.js";

export type SetupState =
  | {
    kind: "uninitialized";
  }
  | {
    kind: "needs_model_access";
    models: SetupModelView[];
  }
  | {
    kind: "needs_coding_policy";
    models: SetupModelView[];
  }
  | {
    kind: "invalid_coding_policy";
    models: SetupModelView[];
    currentCandidates: Array<{ provider: string; id: string }>;
    problems: string[];
  }
  | {
    kind: "needs_mechanic_workspace";
    models: SetupModelView[];
  }
  | {
    kind: "ready";
    models: SetupModelView[];
  };

export interface ResolveSetupStateDeps {
  listModels?: (workspace: string) => SetupModelView[];
}

export async function resolveSetupState(
  workspace: string,
  deps: ResolveSetupStateDeps = {},
): Promise<SetupState> {
  if (!existsSync(primaryConfigPath(workspace))) {
    return { kind: "uninitialized" };
  }

  const listModels = deps.listModels ?? listAvailableSetupModels;
  const models = listModels(workspace);
  if (models.length === 0) {
    return {
      kind: "needs_model_access",
      models,
    };
  }

  let raw: Record<string, unknown>;
  try {
    raw = loadRawSetupConfig(workspace);
  } catch (err) {
    return {
      kind: "invalid_coding_policy",
      models,
      currentCandidates: [],
      problems: [err instanceof Error ? err.message : String(err)],
    };
  }

  const policyState = readPolicyState(raw.modelPolicies, DEFAULT_MODEL_POLICY);
  if (policyState.kind === "missing") {
    return {
      kind: "needs_coding_policy",
      models,
    };
  }

  const resolution = policyState.kind === "configured"
    ? resolvePolicyAgainstRawConfig(workspace, raw, DEFAULT_MODEL_POLICY)
    : undefined;
  if (!resolution?.selected) {
    return {
      kind: "invalid_coding_policy",
      models,
      currentCandidates: policyState.candidates,
      problems: policyState.kind === "invalid"
        ? policyState.problems
        : resolution?.problems ?? [],
    };
  }

  if (!hasSetupAgentContexts(workspace, raw)) {
    return {
      kind: "needs_mechanic_workspace",
      models,
    };
  }

  return {
    kind: "ready",
    models,
  };
}

export function isSetupReady(
  state: SetupState,
): state is Extract<SetupState, { kind: "ready" }> {
  return state.kind === "ready";
}
