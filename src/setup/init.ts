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
import {
  DEFAULT_CONTEXT_ENV,
  DEFAULT_CONTEXT_SOURCES,
} from "../context/index.js";
import { writeJsonFileAtomic } from "../util/json-file.js";
import { brand, dim, heading } from "../util/style.js";
import {
  createDefaultShrimpyWatches,
  createDefaultStatusConfig,
} from "./defaults.js";
import { loadSetupTemplate, stableDocsRoot } from "./templates.js";

function writeRawConfig(workspace: string, raw: Record<string, unknown>): void {
  writeJsonFileAtomic(createWorkspacePaths(workspace).primaryConfigPath, raw);
}

function defaultShrimpyConfig(): Record<string, unknown> {
  return {
    agents: [
      {
        id: "shrimpy",
        root: "agents/shrimpy",
        tools: [
          "reply",
          "ask",
          "notify",
          "report",
          "send_message",
          "read_channel",
          "run_child",
        ],
        channelPolicy: {
          mode: "all",
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
    },
    status: createDefaultStatusConfig(),
  };
}

export function setupSkillPath(workspace: string): string {
  return join(setupSkillRootPath(workspace), "SKILL.md");
}

export function setupSkillRootPath(workspace: string): string {
  return join(
    createAgentPaths(workspace, "agents/shrimpy").skillsDir,
    "setup",
  );
}

export function setupSkillValidatorPath(workspace: string): string {
  return join(
    setupSkillRootPath(workspace),
    "scripts",
    "validate-config.sh",
  );
}

export function workspaceSkillPath(
  workspace: string,
  skillName: string,
): string {
  return join(workspace, "skills", skillName, "SKILL.md");
}

function workspaceSkillBundleFiles(
  workspace: string,
  docsPath: string,
): Array<{ path: string; content: string }> {
  return [
    {
      path: workspaceSkillPath(workspace, "add-agent"),
      content: loadSetupTemplate("skills/add-agent/SKILL.md", docsPath),
    },
    {
      path: workspaceSkillPath(workspace, "memory-management"),
      content: loadSetupTemplate("skills/memory-management/SKILL.md", docsPath),
    },
    {
      path: workspaceSkillPath(workspace, "journal-daily"),
      content: loadSetupTemplate("skills/journal-daily/SKILL.md", docsPath),
    },
    {
      path: workspaceSkillPath(workspace, "journal-compact"),
      content: loadSetupTemplate("skills/journal-compact/SKILL.md", docsPath),
    },
  ];
}

function setupSkillBundleFiles(
  workspace: string,
  docsPath: string,
): Array<{ path: string; content: string }> {
  return [
    {
      path: setupSkillPath(workspace),
      content: loadSetupTemplate("skills/setup/SKILL.md", docsPath),
    },
    {
      path: setupSkillValidatorPath(workspace),
      content: loadSetupTemplate(
        "skills/setup/scripts/validate-config.sh",
        docsPath,
      ),
    },
  ];
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
  console.log();
}

export interface SetupInitResult {
  created: string[];
  existing: string[];
}

export function ensureWorkspaceInitialized(workspace: string): SetupInitResult {
  const created: string[] = [];
  const existing: string[] = [];

  mkdirSync(workspace, { recursive: true });
  mkdirSync(configDir(workspace), { recursive: true });
  const paths = createWorkspacePaths(workspace);
  const agentPaths = createAgentPaths(workspace, "agents/shrimpy");
  const docsPath = stableDocsRoot();

  const configTargetPath = paths.primaryConfigPath;
  if (!hasPrimaryConfig(workspace)) {
    writeRawConfig(workspace, defaultShrimpyConfig());
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
          },
        },
        maintenance: {
          agents: {
            shrimpy: {},
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
      path: join(paths.vaultDir, ".gitkeep"),
      content: "",
    },
    {
      path: join(paths.projectsDir, ".gitkeep"),
      content: "",
    },
    {
      path: join(agentPaths.vaultDir, ".gitkeep"),
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
      path: join(agentPaths.contextDir, "identity.md"),
      content: loadSetupTemplate("context/identity.md", docsPath),
    },
    {
      path: join(agentPaths.contextDir, "habits.md"),
      content: loadSetupTemplate("context/habits.md", docsPath),
    },
    ...setupSkillBundleFiles(workspace, docsPath),
    ...workspaceSkillBundleFiles(workspace, docsPath),
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
