import type { AppRuntime } from "../app/index.js";
import type { ShrimpyConfig } from "../config/index.js";
import type { ThinkingLevel } from "../inference/thinking.js";
import { runSetupEntry, type SetupEntryResult } from "../setup/service.js";
import { parseThinking } from "./agent-helpers.js";
import { renderCommandUsage } from "./catalog.js";
import { bootstrapInteractiveCompletion } from "./completion-runtime.js";
import {
  type CommandResult,
  parseCommandArgs,
  usage,
} from "./framework.js";
import {
  createShrimpyTuiCommand,
} from "./tui.js";

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
  isSetupReady?: (workspace: string) => Promise<boolean>;
  runSetup?: (
    workspace: string,
    opts: { cwd: string },
  ) => Promise<SetupEntryResult>;
  bootstrapCompletion?: () => Promise<unknown>;
  cwd?: string;
}

const CHAT_USAGE = renderCommandUsage(["chat"]);

export async function cmdChat(
  args: string[],
  config: ShrimpyConfig,
  deps: ChatCommandDeps = {},
): Promise<CommandResult> {
  const cwd = deps.cwd ?? process.cwd();
  const request = createChatSessionRequest(args, CHAT_USAGE, cwd);

  return createShrimpyTuiCommand(request, {
    createRuntime: deps.createRuntime,
    loadConfig: deps.loadConfig,
    launchSession: deps.launchChatSession
      ? async (runtime, request) => {
        await deps.launchChatSession?.(runtime, request as ChatSessionRequest);
      }
      : undefined,
    isSetupReady: deps.isSetupReady,
    runSetup: deps.runSetup ?? runSetupEntry,
    beforeLaunch: deps.bootstrapCompletion ?? bootstrapInteractiveCompletion,
  });
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
