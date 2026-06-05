import { createAppRuntime, type AppRuntime } from "../app/index.js";
import {
  loadConfigForWorkspace,
  type ShrimpyConfig,
} from "../config/index.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import { runSetupEntry, type SetupEntryResult } from "../setup/service.js";
import { runInteractiveAgentSession } from "../sessions/index.js";
import { parseThinking } from "./agent-helpers.js";
import { renderCommandUsage } from "./catalog.js";
import { bootstrapInteractiveCompletion } from "./completion-runtime.js";
import {
  parseCommandArgs,
  printError,
  usage,
} from "./framework.js";
import { shouldRunSetupBootstrapForRootShrimpy } from "./root.js";

export interface ChatSessionRequest {
  agentId?: string;
  channel: "tui";
  sessionType: "tui";
  provider?: string;
  model?: string;
  modelPolicy?: string;
  thinking?: ThinkingLevel;
  skills?: string[];
  cwd: string;
}

export interface ChatCommandDeps {
  createRuntime?: (config: ShrimpyConfig) => AppRuntime;
  loadConfig?: (workspace: string) => ShrimpyConfig;
  launchChatSession?: (
    runtime: AppRuntime,
    request: ChatSessionRequest,
  ) => Promise<void>;
  shouldRunSetup?: (workspace: string) => Promise<boolean>;
  runSetup?: (workspace: string, opts: { cwd: string }) => Promise<SetupEntryResult>;
  bootstrapCompletion?: () => Promise<unknown>;
  cwd?: string;
}

const CHAT_USAGE = renderCommandUsage(["chat"]);

export async function cmdChat(
  args: string[],
  config: ShrimpyConfig,
  deps: ChatCommandDeps = {},
): Promise<number> {
  const cwd = deps.cwd ?? process.cwd();
  const request = createChatSessionRequest(args, CHAT_USAGE, cwd);

  if (!request.agentId) {
    const shouldRunSetup = deps.shouldRunSetup ?? shouldRunSetupBootstrapForRootShrimpy;
    if (await shouldRunSetup(config.workspace)) {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        return printError(
          "Shrimpy needs a usable coding model policy before opening the TUI. Run: shrimpy setup",
        );
      }

      const result = await (deps.runSetup ?? runSetupEntry)(config.workspace, { cwd });
      return result.kind === "setup_started" ? 0 : 1;
    }
  }

  await (deps.bootstrapCompletion ?? bootstrapInteractiveCompletion)();

  const loadedConfig = (deps.loadConfig ?? loadConfigForWorkspace)(config.workspace);
  const runtime = (deps.createRuntime ?? createAppRuntime)(loadedConfig);
  await (deps.launchChatSession ?? launchChatSession)(runtime, request);
  return 0;
}

export function createChatSessionRequest(
  args: string[],
  usageText: string,
  cwd: string,
): ChatSessionRequest {
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
    usage: usageText,
  });

  if (positionals.length > 1) {
    usage(usageText, "chat accepts at most one agent id");
  }

  return {
    agentId: positionals[0],
    channel: "tui",
    sessionType: "tui",
    provider: values.provider,
    model: values.model,
    modelPolicy: values["model-policy"],
    thinking: parseThinking(values.thinking),
    skills: values.skill,
    cwd,
  };
}

async function launchChatSession(
  runtime: AppRuntime,
  request: ChatSessionRequest,
): Promise<void> {
  await runInteractiveAgentSession({
    runtime,
    ...request,
  });
}
