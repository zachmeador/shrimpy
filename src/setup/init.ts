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
import { DEFAULT_MODEL_POLICY } from "../config/model.js";
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

function writeRawConfig(workspace: string, raw: Record<string, unknown>): void {
  writeJsonFileAtomic(createWorkspacePaths(workspace).primaryConfigPath, raw);
}

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

export function setupSkillPath(workspace: string): string {
  return join(setupSkillRootPath(workspace), "SKILL.md");
}

export function setupSkillRootPath(workspace: string): string {
  return agentSkillRootPath(workspace, `agents/${MECHANIC_AGENT_ID}`, "setup");
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

export function agentSkillRootPath(
  workspace: string,
  agentRoot: string,
  skillName: string,
): string {
  return join(createAgentPaths(workspace, agentRoot).skillsDir, skillName);
}

export function agentSkillPath(
  workspace: string,
  agentRoot: string,
  skillName: string,
): string {
  return join(agentSkillRootPath(workspace, agentRoot, skillName), "SKILL.md");
}

function workspaceSkillBundleFiles(
  workspace: string,
  docsPath: string,
): Array<{ path: string; content: string }> {
  return [
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
      content: loadSetupTemplate("mechanic/skills/setup/SKILL.md", docsPath),
    },
    {
      path: setupSkillValidatorPath(workspace),
      content: loadSetupTemplate(
        "mechanic/skills/setup/scripts/validate-config.sh",
        docsPath,
      ),
    },
  ];
}

function mechanicSkillBundleFiles(
  workspace: string,
  docsPath: string,
): Array<{ path: string; content: string }> {
  const mechanicRoot = `agents/${MECHANIC_AGENT_ID}`;
  return [
    {
      path: agentSkillPath(workspace, mechanicRoot, "mechanic"),
      content: loadSetupTemplate("mechanic/skills/mechanic/SKILL.md", docsPath),
    },
    {
      path: agentSkillPath(workspace, mechanicRoot, "add-agent"),
      content: loadSetupTemplate("mechanic/skills/add-agent/SKILL.md", docsPath),
    },
    {
      path: agentSkillPath(workspace, mechanicRoot, "channel-routing"),
      content: loadSetupTemplate("mechanic/skills/channel-routing/SKILL.md", docsPath),
    },
    {
      path: agentSkillPath(workspace, mechanicRoot, "schedules"),
      content: loadSetupTemplate("mechanic/skills/schedules/SKILL.md", docsPath),
    },
    {
      path: agentSkillPath(workspace, mechanicRoot, "shrimpy-mechanic-ideas"),
      content: loadSetupTemplate("mechanic/skills/shrimpy-mechanic-ideas/SKILL.md", docsPath),
    },
    {
      path: join(
        agentSkillRootPath(workspace, mechanicRoot, "shrimpy-mechanic-ideas"),
        "references",
        "pattern-inventory.md",
      ),
      content: loadSetupTemplate(
        "mechanic/skills/shrimpy-mechanic-ideas/references/pattern-inventory.md",
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
  const mechanicPaths = createAgentPaths(workspace, "agents/mechanic");
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
      path: join(mechanicPaths.vaultDir, ".gitkeep"),
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
    {
      path: mechanicPaths.soulPath,
      content: loadSetupTemplate("mechanic/SOUL.md", docsPath),
    },
    {
      path: join(mechanicPaths.contextDir, "identity.md"),
      content: loadSetupTemplate("mechanic/context/identity.md", docsPath),
    },
    {
      path: join(mechanicPaths.contextDir, "habits.md"),
      content: loadSetupTemplate("context/habits.md", docsPath),
    },
    {
      path: join(mechanicPaths.contextDir, "scope.md"),
      content: loadSetupTemplate("mechanic/context/scope.md", docsPath),
    },
    ...setupSkillBundleFiles(workspace, docsPath),
    ...mechanicSkillBundleFiles(workspace, docsPath),
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
