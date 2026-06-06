import {
  createAppRuntime,
  type AppRuntime,
} from "../app/index.js";
import {
  loadConfigForWorkspace,
  type ShrimpyConfig,
} from "../config/index.js";
import {
  hasUsableCodingModelPolicyForWorkspace,
  TUI_SETUP_REQUIRED_MESSAGE,
} from "../setup/readiness.js";
import {
  runSetupEntry,
  type SetupEntryResult,
} from "../setup/service.js";
import {
  runInteractiveAgentSession,
  type RunInteractiveSessionInput,
} from "../sessions/index.js";

export type ShrimpyTuiSessionRequest = Omit<RunInteractiveSessionInput, "runtime">;

export interface ShrimpyTuiCommandDeps {
  createRuntime?: (config: ShrimpyConfig) => AppRuntime;
  loadConfig?: (workspace: string) => ShrimpyConfig;
  launchSession?: (
    runtime: AppRuntime,
    request: ShrimpyTuiSessionRequest,
  ) => Promise<void>;
  isSetupReady?: (workspace: string) => Promise<boolean>;
  runSetup?: (
    workspace: string,
    opts: { cwd: string },
  ) => Promise<SetupEntryResult>;
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
  const isSetupReady =
    deps.isSetupReady ?? hasUsableCodingModelPolicyForWorkspace;

  if (!(await isSetupReady(config.workspace))) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return printError(TUI_SETUP_REQUIRED_MESSAGE);
    }

    const result = await (deps.runSetup ?? runSetupEntry)(config.workspace, {
      cwd: request.cwd ?? process.cwd(),
    });
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
