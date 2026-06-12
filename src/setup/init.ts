import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createAgentPaths, createWorkspacePaths } from "../app/index.js";
import { writeChannelMemberships } from "../channels/membership.js";
import {
  configDir,
  hasPrimaryConfig,
} from "../config/index.js";
import { editConfigFile } from "../config/store.js";
import {
  DEFAULT_CONTEXT_ENV,
  DEFAULT_CONTEXT_SOURCES,
} from "../context/index.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import {
  gatewayServiceManager,
  gatewayServicePaths,
} from "../gateway/service-ctl.js";
import { writeJsonFileAtomic } from "../util/json-file.js";
import { resolveLocalTimezone } from "../util/time-format.js";
import { brand, dim, heading } from "../util/style.js";
import {
  createDefaultShrimpyWatches,
  createDefaultStatusConfig,
} from "./defaults.js";
import { loadSetupTemplate, stableDocsRoot } from "./templates.js";

export const MECHANIC_AGENT_ID = "mechanic";

const DEFAULT_AGENT_TOOLS = [
  "reply",
  "ask",
  "notify",
  "report",
  "send_message",
  "read_channel",
  "run_child",
];

function defaultShrimpyConfig(): Record<string, unknown> {
  return {
    agents: [
      {
        id: "shrimpy",
        root: "agents/shrimpy",
        modelPolicy: DEFAULT_MODEL_POLICY,
        tools: DEFAULT_AGENT_TOOLS,
        channelPolicy: {
          mode: "all",
        },
      },
      {
        id: MECHANIC_AGENT_ID,
        root: "agents/mechanic",
        modelPolicy: DEFAULT_MODEL_POLICY,
        tools: DEFAULT_AGENT_TOOLS,
        thinking: "high",
        channelPolicy: {
          mode: "addressed",
        },
      },
    ],
    runtime: {
      theme: "shrimpy",
      quietStartup: true,
      noPromptTemplates: true,
    },
    tools: {
      sendMessage: {
        defaultActorId: "agent:shrimpy",
      },
      readChannel: {
        defaultLimit: 20,
      },
    },
    context: {
      sources: [...DEFAULT_CONTEXT_SOURCES],
      env: [...DEFAULT_CONTEXT_ENV],
      channels: {},
      turn: {
        maxChars: 2000,
        channelUnread: {
          enabled: true,
          channels: ["*"],
          includeLatest: true,
        },
        sessionStatus: {
          enabled: true,
          staleAfterMinutes: 720,
        },
      },
    },
    watchClock: {
      tickIntervalMs: 1000,
      defaultTimezone: resolveLocalTimezone(),
    },
    status: createDefaultStatusConfig(),
  };
}

export async function setupInit(workspace: string): Promise<void> {
  const { created, existing } = ensureWorkspaceInitialized(workspace);

  console.log(`\n${brand()} ${heading("setup: init")}\n`);
  for (const path of created) {
    console.log(`${dim("created:")} ${path}`);
  }
  for (const path of existing) {
    console.log(`${dim("exists: ")} ${path}`);
  }
  for (const line of setupNextStepLines(workspace)) {
    console.log(line);
  }
  console.log();
}

export interface SetupInitResult {
  created: string[];
  existing: string[];
}

interface SetupNextStepLinesOptions {
  phase?: "init" | "post-onboarding";
}

export function setupNextStepLines(
  workspace: string,
  options: SetupNextStepLinesOptions = {},
): string[] {
  const paths = createWorkspacePaths(workspace);
  const servicePaths = gatewayServicePaths();
  const manager = gatewayServiceManager();
  const serviceFile = manager === "systemd"
    ? servicePaths.unitPath
    : manager === "launchd"
      ? servicePaths.launchAgentPath
      : undefined;
  const nextLines = options.phase === "post-onboarding"
    ? ["  shrimpy                  open the main TUI"]
    : ["  shrimpy setup             choose a model and finish guided setup"];

  nextLines.push("  shrimpy status            inspect setup, workspace, and gateway status");

  return [
    "",
    heading("Next:"),
    ...nextLines,
    "",
    heading("Paths:"),
    `  workspace: ${paths.workspace}`,
    `  config:    ${paths.primaryConfigPath}`,
    `  log:       ${paths.gatewayLogPath}`,
    ...(serviceFile ? [`  service:   ${serviceFile}`] : []),
  ];
}

export function ensureWorkspaceInitialized(workspace: string): SetupInitResult {
  const created: string[] = [];
  const existing: string[] = [];

  mkdirSync(workspace, { recursive: true });
  mkdirSync(configDir(workspace), { recursive: true });
  const paths = createWorkspacePaths(workspace);
  const agentPaths = createAgentPaths(workspace, "agents/shrimpy");
  const mechanicPaths = createAgentPaths(workspace, "agents/mechanic");
  const docsPath = stableDocsRoot();

  const configTargetPath = paths.primaryConfigPath;
  if (!hasPrimaryConfig(workspace)) {
    editConfigFile(workspace, (raw) => {
      Object.assign(raw, defaultShrimpyConfig());
    });
    created.push(configTargetPath);
  } else {
    existing.push(configTargetPath);
  }

  const watchesTargetPath = agentPaths.watchesPath;
  if (!existsSync(watchesTargetPath)) {
    writeJsonFileAtomic(watchesTargetPath, createDefaultShrimpyWatches());
    created.push(watchesTargetPath);
  } else {
    existing.push(watchesTargetPath);
  }

  const channelMembershipsPath = paths.channelMembershipsPath;
  if (!existsSync(channelMembershipsPath)) {
    writeChannelMemberships(channelMembershipsPath, {
      channels: {
        home: {
          agents: {
            shrimpy: {},
            mechanic: {},
          },
        },
        maintenance: {
          agents: {
            shrimpy: {},
            mechanic: {},
          },
        },
      },
    });
    created.push(channelMembershipsPath);
  } else {
    existing.push(channelMembershipsPath);
  }

  const workspaceFiles = [
    {
      path: join(agentPaths.vaultDir, ".gitkeep"),
      content: "",
    },
    {
      path: join(agentPaths.projectsDir, ".gitkeep"),
      content: "",
    },
    {
      path: join(mechanicPaths.vaultDir, ".gitkeep"),
      content: "",
    },
    {
      path: join(mechanicPaths.projectsDir, ".gitkeep"),
      content: "",
    },
    {
      path: paths.workspacePromptPath,
      content: loadSetupTemplate("WORKSPACE.md", docsPath),
    },
    {
      path: paths.userPromptPath,
      content: loadSetupTemplate("USER.md", docsPath),
    },
    {
      path: paths.systemPromptPath,
      content: loadSetupTemplate("SYSTEM.md", docsPath),
    },
    {
      path: agentPaths.soulPath,
      content: loadSetupTemplate("SOUL.md", docsPath),
    },
    {
      path: join(agentPaths.contextDir, "habits.md"),
      content: loadSetupTemplate("context/habits.md", docsPath),
    },
    {
      path: mechanicPaths.soulPath,
      content: loadSetupTemplate("mechanic/SOUL.md", docsPath),
    },
    {
      path: join(mechanicPaths.contextDir, "habits.md"),
      content: loadSetupTemplate("context/habits.md", docsPath),
    },
    {
      path: join(mechanicPaths.contextDir, "scope.md"),
      content: loadSetupTemplate("mechanic/context/scope.md", docsPath),
    },
  ];

  for (const file of workspaceFiles) {
    mkdirSync(dirname(file.path), { recursive: true });
    if (!existsSync(file.path)) {
      writeFileSync(file.path, file.content, "utf-8");
      created.push(file.path);
    } else {
      existing.push(file.path);
    }
  }

  return { created, existing };
}
