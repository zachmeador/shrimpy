import { existsSync } from "node:fs";
import { primaryConfigPath } from "../workspace/paths.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import type { AppRuntime } from "../app/runtime.js";
import {
  hasSetupAgentWorkspace,
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

interface ResolveSetupStateDeps {
  listModels?: (workspace: string) => SetupModelView[] | Promise<SetupModelView[]>;
}

export async function resolveSetupState(
  workspace: string,
  deps: ResolveSetupStateDeps = {},
): Promise<SetupState> {
  if (!existsSync(primaryConfigPath(workspace))) {
    return { kind: "uninitialized" };
  }

  const listModels = deps.listModels ?? listAvailableSetupModels;
  const models = await listModels(workspace);
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
    ? await resolvePolicyAgainstRawConfig(workspace, raw, DEFAULT_MODEL_POLICY)
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

  if (!hasSetupAgentWorkspace(workspace, raw)) {
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

export const TUI_SETUP_REQUIRED_MESSAGE =
  "Shrimpy needs a usable coding model policy before opening the TUI. Run: shrimpy setup";

export async function assertSetupReadyForNormalTui(
  runtime: AppRuntime,
): Promise<void> {
  const state = await resolveSetupState(runtime.paths.workspace);
  if (!isSetupReady(state)) {
    throw new Error(TUI_SETUP_REQUIRED_MESSAGE);
  }
}
