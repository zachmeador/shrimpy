import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  createAppRuntime,
  createWorkspacePaths,
} from "../app/index.js";
import {
  hasPrimaryConfig,
  loadConfigForWorkspace,
  type ShrimpyConfig,
} from "../config/index.js";
import {
  DEFAULT_MODEL_POLICY,
} from "../config/model.js";
import {
  runInteractiveAgentSession,
} from "../tui/interactive.js";
import {
  ensureWorkspaceInitialized,
  MECHANIC_AGENT_ID,
  setupNextStepLines,
  type SetupInitResult,
} from "./init.js";
import {
  ensureCodingModelPolicy,
  formatModelLabel,
  type ConfirmReplaceModelPolicyInput,
  type SelectSetupModelInput,
  type SetupPolicyProblem,
} from "./coding-policy.js";
import {
  canRunInteractiveModelOnboarding,
  launchModelAccessOnboarding,
  listAvailableSetupModels,
  type ModelAccessOnboardingInput,
  type SetupModelView,
} from "./model-access.js";
import {
  isSetupReady,
  resolveSetupState,
  type SetupState,
} from "./state.js";

interface SetupSessionLaunchInput {
  config: ShrimpyConfig;
  cwd?: string;
}

interface SetupInteractiveSessionSpec {
  agentId: typeof MECHANIC_AGENT_ID;
  channel: "setup";
  sessionType: "tui";
  initialMessage: string;
  skills: ["setup"];
  modelPolicy: typeof DEFAULT_MODEL_POLICY;
  cwd?: string;
}

interface RunSetupOnboardingDeps {
  cwd?: string;
  confirmExistingConfig?: (configPath: string) => Promise<boolean>;
  confirmReplaceModelPolicy?: (input: ConfirmReplaceModelPolicyInput) => Promise<boolean>;
  launchModelAccessOnboarding?: (input: ModelAccessOnboardingInput) => Promise<void>;
  launchSetupSession?: (input: SetupSessionLaunchInput) => Promise<void>;
  listModels?: (workspace: string) => SetupModelView[];
  selectCodingModel?: (input: SelectSetupModelInput) => Promise<SetupModelView | undefined>;
  canRunInteractiveModelOnboarding?: () => boolean;
  log?: (line: string) => void;
}

export interface SetupOnboardingResult {
  kind:
    | "already_configured"
    | "needs_model_access"
    | "needs_policy"
    | "skipped_existing_config"
    | "setup_started";
  init: SetupInitResult;
  state: SetupState;
  models: SetupModelView[];
  policyProblems?: SetupPolicyProblem[];
}

export function setupOnboardingExitCode(result: SetupOnboardingResult): number {
  return result.kind === "setup_started" || result.kind === "already_configured"
    ? 0
    : 1;
}

export async function launchSetupSession(
  input: SetupSessionLaunchInput,
): Promise<void> {
  const runtime = createAppRuntime(input.config);
  await runInteractiveAgentSession({
    runtime,
    ...createSetupInteractiveSessionSpec(input),
  });
}

export function createSetupInteractiveSessionSpec(
  input: SetupSessionLaunchInput,
): SetupInteractiveSessionSpec {
  return {
    agentId: MECHANIC_AGENT_ID,
    channel: "setup",
    sessionType: "tui",
    initialMessage: "Begin setup.",
    skills: ["setup"],
    modelPolicy: DEFAULT_MODEL_POLICY,
    cwd: input.cwd,
  };
}

export async function runSetupOnboarding(
  workspace: string,
  deps: RunSetupOnboardingDeps = {},
): Promise<SetupOnboardingResult> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const cwd = deps.cwd ?? workspace;
  const listModels = deps.listModels ?? listAvailableSetupModels;
  const hadPrimaryConfig = hasPrimaryConfig(workspace);

  let state = await resolveSetupState(workspace, { listModels });
  if (isSetupReady(state)) {
    log("");
    log("shrimpy setup");
    log("");
    log("Setup already has a model policy and agent workspace. Nothing to do.");
    log("Use `shrimpy mechanic` to shape the workspace, or `shrimpy setup telegram` to add a chat surface.");
    return {
      kind: "already_configured",
      init: { created: [], existing: [] },
      state,
      models: state.models,
    };
  }

  const init = ensureWorkspaceInitialized(workspace);

  log("");
  log("shrimpy setup");
  log("");

  if (init.created.length > 0) {
    log(
      `Initialized ${init.created.length} workspace ${init.created.length === 1 ? "file" : "files"}.`,
    );
  }

  state = await resolveSetupState(workspace, { listModels });

  if (state.kind === "needs_model_access") {
    const canRunModelOnboarding =
      (deps.canRunInteractiveModelOnboarding ?? canRunInteractiveModelOnboarding)();

    if (!canRunModelOnboarding) {
      logModelAccessRequired(workspace, log);
      return {
        kind: "needs_model_access",
        init,
        state,
        models: state.models,
      };
    }

    log("No working models found yet.");
    log("Starting model access setup...");

    await (deps.launchModelAccessOnboarding ?? launchModelAccessOnboarding)({
      workspace,
      cwd,
    });

    state = await resolveSetupState(workspace, { listModels });
    if (state.kind === "needs_model_access") {
      logModelAccessRequired(workspace, log);
      return {
        kind: "needs_model_access",
        init,
        state,
        models: state.models,
      };
    }
  }

  const models = "models" in state ? state.models : listModels(workspace);
  const preview = models.slice(0, 2).map(formatModelLabel).join(", ");
  if (models.length > 0) {
    log(
      `Found ${models.length} available model${models.length === 1 ? "" : "s"}${preview ? `: ${preview}` : ""}.`,
    );
  }

  if (
    state.kind === "needs_coding_policy" ||
    state.kind === "invalid_coding_policy" ||
    state.kind === "needs_mechanic_workspace"
  ) {
    const policyBootstrap = await ensureCodingModelPolicy(workspace, models, deps, log);
    if (!policyBootstrap.ok) {
      return {
        kind: "needs_policy",
        init,
        state: await resolveSetupState(workspace, { listModels }),
        models,
        policyProblems: policyBootstrap.problems,
      };
    }
  }

  state = await resolveSetupState(workspace, { listModels });

  if (hadPrimaryConfig) {
    const configPath = createWorkspacePaths(workspace).primaryConfigPath;
    const confirmed = await (deps.confirmExistingConfig ?? confirmExistingConfig)(
      configPath,
      log,
    );
    if (!confirmed) {
      log("Setup rerun cancelled.");
      return {
        kind: "skipped_existing_config",
        init,
        state,
        models: "models" in state ? state.models : models,
      };
    }
  }

  log("Launching mechanic setup session...");

  const config = loadConfigForWorkspace(workspace);
  await (deps.launchSetupSession ?? launchSetupSession)({
    config,
    cwd,
  });

  for (const line of setupNextStepLines(workspace, { phase: "post-onboarding" })) {
    log(line);
  }

  return {
    kind: "setup_started",
    init,
    state,
    models: "models" in state ? state.models : models,
  };
}

function logModelAccessRequired(
  workspace: string,
  log: (line: string) => void,
): void {
  const paths = createWorkspacePaths(workspace);
  log("No working models found yet.");
  log("Run `shrimpy setup` in an interactive terminal to configure model access.");
  log(`Model auth state: ${paths.authPath}`);
  log(`Model registry:   ${paths.modelsPath}`);
}

async function confirmExistingConfig(
  configPath: string,
  log: (line: string) => void,
): Promise<boolean> {
  if (!stdin.isTTY || !stdout.isTTY) {
    log(`Existing config found at ${configPath}. Interactive confirmation is required to rerun setup.`);
    return false;
  }

  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      `Workspace config already exists at ${configPath}. Rerun interactive setup? [y/N] `,
    );
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}
