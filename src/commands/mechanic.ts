import type { AppRuntime } from "../app/index.js";
import type { ShrimpyConfig } from "../config/index.js";
import { MECHANIC_AGENT_ID } from "../setup/init.js";
import type { SetupOnboardingResult } from "../setup/onboarding.js";
import type { SetupState } from "../setup/state.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import {
  MODEL_SESSION_OPTIONS,
  readModelSessionValues,
} from "./agent-helpers.js";
import {
  type CommandResult,
  parseCommandArgs,
} from "./framework.js";
import { createShrimpyTuiCommand } from "./tui.js";

export interface MechanicSessionRequest {
  agentId: typeof MECHANIC_AGENT_ID;
  channel: "tui";
  sessionType: "tui";
  provider?: string;
  model?: string;
  modelPolicy?: string;
  thinking?: ThinkingLevel;
  skills?: string[];
  initialMessage?: string;
  cwd: string;
}

interface MechanicCommandDeps {
  createRuntime?: (config: ShrimpyConfig) => AppRuntime;
  loadConfig?: (workspace: string) => ShrimpyConfig;
  launchMechanicSession?: (
    runtime: AppRuntime,
    request: MechanicSessionRequest,
  ) => Promise<void>;
  resolveSetupState?: (workspace: string) => Promise<SetupState>;
  runOnboarding?: (
    workspace: string,
    opts: { cwd: string },
  ) => Promise<SetupOnboardingResult>;
  cwd?: string;
}

export async function cmdMechanic(
  args: string[],
  config: ShrimpyConfig,
  deps: MechanicCommandDeps = {},
): Promise<CommandResult> {
  const request = createMechanicSessionRequest(
    args,
    "usage: shrimpy mechanic [prompt] [--provider <p>] [--model <m>] [--model-policy <name>] [--thinking <level>] [--skill <id>]",
    deps.cwd ?? process.cwd(),
  );
  return createShrimpyTuiCommand(request, {
    createRuntime: deps.createRuntime,
    loadConfig: deps.loadConfig,
    launchSession: deps.launchMechanicSession
      ? async (runtime, request) => {
        await deps.launchMechanicSession?.(
          runtime,
          request as MechanicSessionRequest,
        );
      }
      : undefined,
    requiredAgent: {
      id: MECHANIC_AGENT_ID,
      missingMessage: `mechanic agent not found. Run "shrimpy setup" in a fresh workspace or add agent "${MECHANIC_AGENT_ID}" before using this command.`,
    },
    resolveSetupState: deps.resolveSetupState,
    runOnboarding: deps.runOnboarding,
  });
}

export function createMechanicSessionRequest(
  args: string[],
  usage: string,
  cwd: string,
): MechanicSessionRequest {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      ...MODEL_SESSION_OPTIONS,
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const prompt = positionals.join(" ").trim() || undefined;
  const sessionValues = readModelSessionValues(values);
  const skills = [...new Set(["mechanic", ...(sessionValues.skills ?? [])])];
  return {
    agentId: MECHANIC_AGENT_ID,
    channel: "tui",
    sessionType: "tui",
    provider: sessionValues.provider,
    model: sessionValues.model,
    modelPolicy: sessionValues.modelPolicy,
    thinking: sessionValues.thinking,
    skills,
    initialMessage: prompt,
    cwd,
  };
}
