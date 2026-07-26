import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createAgentPaths, createWorkspacePaths } from "../workspace/paths.js";
import { ensureShrimpyRuntimeEnvironment } from "../app/environment.js";
import { writeChannelMemberships } from "../channels/membership.js";
import { configDir, hasPrimaryConfig } from "../workspace/paths.js";
import { editConfigFile } from "../config/store.js";
import { DEFAULT_CONTEXT_ENV, DEFAULT_CONTEXT_SOURCES } from "../context/spec.js";
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
import {
  gatewayServiceManager,
  gatewayServicePaths,
} from "../gateway/service/index.js";
import { refreshWorkerBackendAvailability } from "../workers/availability.js";
import { resolveLocalTimezone } from "../util/time-format.js";
import { heading } from "../util/style.js";
import { listAssignedIncludedSkillDefinitions } from "../skills/included.js";
import { prepareIncludedPackageSource } from "../skills/packages/sources.js";
import { installIncludedSkillPackageCopy } from "../skills/packages/operations.js";
import { loadSetupTemplate, stableDocsRoot } from "./templates.js";

export const MECHANIC_AGENT_ID = "mechanic";

const DEFAULT_AGENT_TOOLS = [
  "reply",
  "ask",
  "notify",
  "report",
  "send_message",
  "read_channel",
];

function defaultShrimpyConfig(): Record<string, unknown> {
  return {
    agents: [
      {
        id: "shrimpy",
        root: "agents/shrimpy",
        cwd: "agents/shrimpy",
        modelPolicy: DEFAULT_MODEL_POLICY,
        tools: DEFAULT_AGENT_TOOLS,
        channelPolicy: {
          mode: "all",
        },
      },
      {
        id: MECHANIC_AGENT_ID,
        root: "agents/mechanic",
        cwd: ".",
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
        producers: [],
        channelUnread: {
          enabled: true,
          channels: ["*"],
          includeLatest: true,
        },
        sessionStatus: {
          enabled: true,
          staleAfterMinutes: 720,
        },
        knowledge: {
          maxItems: 3,
          minScore: 1.5,
        },
      },
    },
    watchClock: {
      tickIntervalMs: 1000,
      defaultTimezone: resolveLocalTimezone(),
    },
    status: {},
  };
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
  const environment = ensureShrimpyRuntimeEnvironment(workspace);
  const servicePaths = gatewayServicePaths({ workspace });
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
    `  command:   ${environment.binDir}/shrimpy`,
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
  const shimPath = `${paths.runtimeBinDir}/shrimpy`;
  const hadShim = existsSync(shimPath);
  const environment = ensureShrimpyRuntimeEnvironment(workspace);
  if (hadShim) {
    existing.push(`${environment.binDir}/shrimpy`);
  } else {
    created.push(`${environment.binDir}/shrimpy`);
  }
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

  const workerBackendsStatePath = paths.workerBackendsStatePath;
  const hadWorkerBackendsState = existsSync(workerBackendsStatePath);
  refreshWorkerBackendAvailability(workspace);
  if (hadWorkerBackendsState) {
    existing.push(workerBackendsStatePath);
  } else {
    created.push(workerBackendsStatePath);
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
      path: paths.workspaceSystemContextPath,
      content: loadSetupTemplate("workspace/context/SYSTEM.md", docsPath, workspace),
    },
    {
      path: paths.workspaceUserContextPath,
      content: loadSetupTemplate("workspace/context/USER.md", docsPath, workspace),
    },
    {
      path: paths.workspaceContextPath,
      content: loadSetupTemplate("workspace/context/WORKSPACE.md", docsPath, workspace),
    },
    {
      path: agentPaths.soulPath,
      content: loadSetupTemplate("workspace/agents/shrimpy/SOUL.md", docsPath),
    },
    {
      path: mechanicPaths.soulPath,
      content: loadSetupTemplate("workspace/agents/mechanic/SOUL.md", docsPath),
    },
    {
      path: join(mechanicPaths.contextDir, "scope.md"),
      content: loadSetupTemplate("workspace/agents/mechanic/context/scope.md", docsPath),
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

  for (const definition of listAssignedIncludedSkillDefinitions()) {
    const source = prepareIncludedPackageSource(definition.source);
    const assignment = definition.assignment;
    if (!source || !assignment) continue;
    const targetRootPath = assignment.scope === "workspace"
      ? join(workspace, "skills", ...definition.id.split("/"))
      : join(
        createAgentPaths(workspace, `agents/${assignment.agentId}`).skillsDir,
        ...definition.id.split("/"),
      );
    const validationAgentPaths = assignment.scope === "agent"
      ? createAgentPaths(workspace, `agents/${assignment.agentId}`)
      : mechanicPaths;
    const validationAgentId = assignment.scope === "agent"
      ? assignment.agentId
      : MECHANIC_AGENT_ID;
    const result = installIncludedSkillPackageCopy({
      workspacePath: workspace,
      source,
      skillId: definition.id,
      scope: assignment.scope,
      agentId: assignment.scope === "agent" ? assignment.agentId : undefined,
      targetRootPath,
      validationAgentId,
      validationAgentRootPath: validationAgentPaths.root,
      preserveExisting: true,
    });
    if (result.created) {
      created.push(result.targetRootPath);
    } else if (result.existing) {
      existing.push(result.targetRootPath);
    }
  }

  return { created, existing };
}
