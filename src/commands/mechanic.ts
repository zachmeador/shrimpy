import { createAppRuntime, type AppRuntime } from "../app/index.js";
import type { ShrimpyConfig } from "../config/index.js";
import { MECHANIC_AGENT_ID } from "../setup/init.js";
import { runInteractiveAgentSession } from "../sessions/index.js";
import { parseThinking } from "./agent-helpers.js";
import {
  parseCommandArgs,
  printError,
} from "./framework.js";

export interface MechanicSessionRequest {
  agentId: typeof MECHANIC_AGENT_ID;
  channel: "tui";
  sessionType: "tui";
  provider?: string;
  model?: string;
  modelPolicy?: string;
  thinking?: ReturnType<typeof parseThinking>;
  skills?: string[];
  initialMessage?: string;
  cwd: string;
}

export interface MechanicCommandDeps {
  createRuntime?: (config: ShrimpyConfig) => AppRuntime;
  launchMechanicSession?: (
    runtime: AppRuntime,
    request: MechanicSessionRequest,
  ) => Promise<void>;
  cwd?: string;
}

export async function cmdMechanic(
  args: string[],
  config: ShrimpyConfig,
  deps: MechanicCommandDeps = {},
): Promise<number> {
  const request = createMechanicSessionRequest(
    args,
    "usage: shrimpy mechanic [prompt] [--provider <p>] [--model <m>] [--model-policy <name>] [--thinking <level>] [--skill <id>]",
    deps.cwd ?? process.cwd(),
  );
  const runtime = (deps.createRuntime ?? createAppRuntime)(config);

  try {
    runtime.getAgent(MECHANIC_AGENT_ID);
  } catch {
    return printError(
      `mechanic agent not found. Run "shrimpy setup init" in a fresh workspace or add agent "${MECHANIC_AGENT_ID}" before using this command.`,
    );
  }

  await (deps.launchMechanicSession ?? launchMechanicSession)(runtime, request);
  return 0;
}

export function createMechanicSessionRequest(
  args: string[],
  usage: string,
  cwd: string,
): MechanicSessionRequest {
  const { values, positionals } = parseCommandArgs({
    args,
    options: {
      provider: { type: "string", short: "p" },
      model: { type: "string", short: "m" },
      "model-policy": { type: "string" },
      thinking: { type: "string" },
      skill: { type: "string", short: "k", multiple: true },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });

  const prompt = positionals.join(" ").trim() || undefined;
  const skills = [...new Set(["mechanic", ...(values.skill ?? [])])];
  return {
    agentId: MECHANIC_AGENT_ID,
    channel: "tui",
    sessionType: "tui",
    provider: values.provider,
    model: values.model,
    modelPolicy: values["model-policy"],
    thinking: parseThinking(values.thinking),
    skills,
    initialMessage: prompt,
    cwd,
  };
}

async function launchMechanicSession(
  runtime: AppRuntime,
  request: MechanicSessionRequest,
): Promise<void> {
  await runInteractiveAgentSession({
    runtime,
    ...request,
  });
}
