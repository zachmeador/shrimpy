import {
  createAppRuntime,
  type AppRuntime,
} from "../app/index.js";
import {
  loadConfigForWorkspace,
  type ShrimpyConfig,
} from "../config/index.js";
import {
  TUI_SETUP_REQUIRED_MESSAGE,
} from "../setup/readiness.js";
import {
  runSetupOnboarding,
  type SetupOnboardingResult,
} from "../setup/onboarding.js";
import {
  isSetupReady,
  resolveSetupState,
  type SetupState,
} from "../setup/state.js";
import {
  runInteractiveAgentSession,
  type RunInteractiveSessionInput,
} from "../sessions/index.js";

type ShrimpyTuiSessionRequest = Omit<RunInteractiveSessionInput, "runtime">;

interface ShrimpyTuiCommandDeps {
  createRuntime?: (config: ShrimpyConfig) => AppRuntime;
  loadConfig?: (workspace: string) => ShrimpyConfig;
  launchSession?: (
    runtime: AppRuntime,
    request: ShrimpyTuiSessionRequest,
  ) => Promise<void>;
  resolveSetupState?: (workspace: string) => Promise<SetupState>;
  runOnboarding?: (
    workspace: string,
    opts: { cwd: string },
  ) => Promise<SetupOnboardingResult>;
  requiredAgent?: {
    id: string;
    missingMessage: string;
  };
  beforeLaunch?: () => Promise<unknown>;
}

export interface ShrimpyTuiCommandResult {
  kind: "shrimpy-tui";
  request: ShrimpyTuiSessionRequest;
  deps?: ShrimpyTuiCommandDeps;
}

export function createShrimpyTuiCommand(
  request: ShrimpyTuiSessionRequest,
  deps?: ShrimpyTuiCommandDeps,
): ShrimpyTuiCommandResult {
  return {
    kind: "shrimpy-tui",
    request,
    deps,
  };
}

export async function runShrimpyTuiCommandSession(
  config: Pick<ShrimpyConfig, "workspace">,
  request: ShrimpyTuiSessionRequest,
  deps: ShrimpyTuiCommandDeps = {},
): Promise<number> {
  const setupState = await (deps.resolveSetupState ?? resolveSetupState)(
    config.workspace,
  );

  if (!isSetupReady(setupState)) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return printError(TUI_SETUP_REQUIRED_MESSAGE);
    }

    const result = await (deps.runOnboarding ?? runSetupOnboarding)(
      config.workspace,
      { cwd: request.cwd ?? process.cwd() },
    );
    return result.kind === "setup_started" ? 0 : 1;
  }

  await deps.beforeLaunch?.();

  const loadedConfig =
    (deps.loadConfig ?? loadConfigForWorkspace)(config.workspace);
  const runtime = (deps.createRuntime ?? createAppRuntime)(loadedConfig);
  if (deps.requiredAgent) {
    try {
      runtime.getAgent(deps.requiredAgent.id);
    } catch {
      return printError(deps.requiredAgent.missingMessage);
    }
  }
  await (deps.launchSession ?? launchSession)(runtime, request);
  return 0;
}

async function launchSession(
  runtime: AppRuntime,
  request: ShrimpyTuiSessionRequest,
): Promise<void> {
  await runInteractiveAgentSession({
    runtime,
    ...request,
  });
}

function printError(message: string): number {
  console.error(message);
  return 1;
}
