/**
 * Interactive setup wizards for shrimpy adapters.
 * Currently: Telegram bot setup.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  configDir,
  hasPrimaryConfig,
} from "./config/index.js";
import {
  telegramChannelDisplayExample,
  validateTelegramInstanceId,
} from "./surfaces/telegram/index.js";
import { createAgentPaths, createWorkspacePaths } from "./app/index.js";
import { writeChannelMemberships } from "./channels/membership.js";
import {
  createDefaultShrimpySchedules,
  createDefaultStatusConfig,
} from "./setup/defaults.js";
import {
  DEFAULT_CONTEXT_ENV,
  DEFAULT_CONTEXT_SOURCES,
} from "./context/index.js";
import { loadSetupTemplate, stableDocsRoot } from "./setup/templates.js";
import {
  readJsonFileStrict,
  writeJsonFileAtomic,
} from "./util/json-file.js";
import { brand, dim, heading } from "./util/style.js";

// --- Prompt helpers ---

function createPrompter() {
  const rl = createInterface({ input: stdin, output: stdout });

  async function ask(question: string): Promise<string> {
    const answer = await rl.question(question);
    return answer.trim();
  }

  async function confirm(question: string, defaultYes = true): Promise<boolean> {
    const hint = defaultYes ? "[Y/n]" : "[y/N]";
    const answer = await ask(`${question} ${hint} `);
    if (answer === "") return defaultYes;
    return /^y(es)?$/i.test(answer);
  }

  return { ask, confirm, close: () => rl.close() };
}

// --- Token validation ---

async function validateToken(
  token: string,
): Promise<{ ok: true; username: string; firstName: string } | { ok: false; error: string }> {
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = await resp.json();
    if (data.ok && data.result) {
      return {
        ok: true,
        username: data.result.username ?? "unknown",
        firstName: data.result.first_name ?? "unknown",
      };
    }
    return { ok: false, error: data.description ?? "unknown error" };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// --- Chat ID parsing ---

function parseChatIds(input: string): number[] | null {
  const parts = input.split(",").map((s) => s.trim()).filter(Boolean);
  const ids: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n)) return null;
    ids.push(n);
  }
  return ids;
}

// --- Gateway status ---

function isServiceActive(serviceName: string): boolean {
  try {
    const out = execFileSync(
      "systemctl",
      ["--user", "is-active", serviceName],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
    return out === "active";
  } catch {
    return false;
  }
}

function checkGatewayStatus(): "active" | "inactive" {
  if (isServiceActive("shrimpy-gateway")) return "active";
  return "inactive";
}

// --- Config I/O ---

function readRawConfig(workspace: string): Record<string, unknown> | null {
  const p = createWorkspacePaths(workspace).primaryConfigPath;
  if (!existsSync(p)) return {};
  try {
    return readJsonFileStrict(
      p,
      (parsed) => parsed as Record<string, unknown>,
    );
  } catch {
    return null;
  }
}

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
        attention: {
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
    scheduler: {
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

  const schedulesTargetPath = agentPaths.schedulesPath;
  if (!existsSync(schedulesTargetPath)) {
    writeJsonFileAtomic(schedulesTargetPath, createDefaultShrimpySchedules());
    created.push(schedulesTargetPath);
  } else {
    existing.push(schedulesTargetPath);
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
        heartbeat: {
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
      path: join(agentPaths.root, "vault", ".gitkeep"),
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

// --- Telegram wizard ---

export async function setupTelegram(workspace: string): Promise<void> {
  const { ask, confirm, close } = createPrompter();

  try {
    // Step 1: Banner
    console.log(`\n${brand()} ${heading("setup: telegram")}\n`);
    console.log("To create a Telegram bot:");
    console.log("  1. Open Telegram and message @BotFather");
    console.log("  2. Send /newbot and follow the prompts");
    console.log("  3. Copy the bot token (looks like 123456:ABC-DEF...)");
    console.log();

    // Step 2: Load existing config
    let raw = readRawConfig(workspace);
    if (raw === null) {
      console.log(
        `Warning: ${createWorkspacePaths(workspace).primaryConfigPath} exists but is not valid JSON.`,
      );
      if (await confirm("Overwrite it?", false)) {
        raw = {};
      } else {
        console.log("Aborted.");
        return;
      }
    }

    const telegramRaw = typeof raw.telegram === "object" && raw.telegram !== null
      ? raw.telegram as Record<string, unknown>
      : {};
    const existingInstances = typeof telegramRaw.instances === "object" &&
        telegramRaw.instances !== null &&
        !Array.isArray(telegramRaw.instances)
      ? telegramRaw.instances as Record<string, {
          token?: string;
          defaultAgentId?: string;
          allowedChatIds?: number[];
        }>
      : {};
    const configuredAgentIds = Array.isArray(raw.agents)
      ? raw.agents
        .map((entry) =>
          typeof entry === "object" && entry !== null && !Array.isArray(entry)
            ? (entry as Record<string, unknown>).id
            : undefined
        )
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
      : ["shrimpy"];

    const suggestedInstanceId = configuredAgentIds.includes("shrimpy")
      ? "shrimpy"
      : (configuredAgentIds[0] ?? "main");
    const instanceInput = await ask(
      `Telegram surface instance id [${suggestedInstanceId}]: `,
    );
    const instanceId = instanceInput || suggestedInstanceId;
    try {
      validateTelegramInstanceId(instanceId);
    } catch (error) {
      console.log((error as Error).message);
      return;
    }

    const existing = existingInstances[instanceId];
    const suggestedAgentId = existing?.defaultAgentId
      ?? (configuredAgentIds.includes(instanceId) ? instanceId : (configuredAgentIds[0] ?? "shrimpy"));
    const defaultAgentInput = await ask(
      `Default agent for telegram.${instanceId} [${suggestedAgentId}]: `,
    );
    const defaultAgentId = defaultAgentInput || suggestedAgentId;
    if (!configuredAgentIds.includes(defaultAgentId)) {
      console.log(
        `Unknown agent "${defaultAgentId}". Known agents: ${configuredAgentIds.join(", ")}`,
      );
      return;
    }

    let token: string | undefined;

    // Step 3: Collect token
    if (existing?.token) {
      const last4 = existing.token.slice(-4);
      console.log(`Existing token found (ends in ...${last4}).`);
      if (await confirm("Keep existing token?")) {
        token = existing.token;
      }
    }

    if (!token) {
      const envToken = process.env.TELEGRAM_BOT_TOKEN;
      if (envToken) {
        console.log("TELEGRAM_BOT_TOKEN found in environment.");
        if (await confirm("Use environment variable?")) {
          token = envToken;
        }
      }
    }

    if (!token) {
      token = await ask("Enter bot token: ");
      if (!token) {
        console.log("No token provided. Aborted.");
        return;
      }
      if (!/^\d+:[A-Za-z0-9_-]+$/.test(token)) {
        console.log("Warning: token doesn't match expected format (123456:ABC...).");
        if (!(await confirm("Continue with this token?", false))) {
          return;
        }
      }
    }

    // Step 4: Validate token
    console.log("Validating token...");
    const result = await validateToken(token);
    if (result.ok) {
      console.log(`Token valid. Bot: @${result.username} (${result.firstName})`);
    } else {
      console.log(`Token validation failed: ${result.error}`);
      if (!(await confirm("Continue with this token anyway?", false))) {
        return;
      }
    }
    console.log();

    // Step 5: Collect allowed chat IDs
    let allowedChatIds: number[] = [];

    console.log("Allowed chat IDs restrict who can message the bot.");
    console.log("To find your chat ID:");
    console.log("  1. Start the gateway: shrimpy gateway start");
    console.log("  2. Send a message to your bot in Telegram");
    console.log("  3. Run: shrimpy channels");
    console.log(`     The channel name ${telegramChannelDisplayExample(instanceId)} has your chat ID`);
    console.log();

    if (existing?.allowedChatIds?.length) {
      console.log(`Existing allowed IDs: ${existing.allowedChatIds.join(", ")}`);
      if (await confirm("Keep existing IDs?")) {
        allowedChatIds = [...existing.allowedChatIds];
      }
    }

    const idsInput = await ask(
      "Enter allowed chat IDs (comma-separated, or Enter to skip): ",
    );
    if (idsInput) {
      const parsed = parseChatIds(idsInput);
      if (parsed === null) {
        console.log("Invalid input — chat IDs must be numbers.");
        const retry = await ask(
          "Enter allowed chat IDs (comma-separated, or Enter to skip): ",
        );
        if (retry) {
          const retryParsed = parseChatIds(retry);
          if (retryParsed === null) {
            console.log("Still invalid. Skipping chat ID allowlist.");
          } else {
            allowedChatIds = [...new Set([...allowedChatIds, ...retryParsed])];
          }
        }
      } else {
        allowedChatIds = [...new Set([...allowedChatIds, ...parsed])];
      }
    }

    if (allowedChatIds.length === 0) {
      console.log("\nNo allowed chat IDs set — the bot will accept messages from anyone.");
    }
    console.log();

    // Step 6: Write config
    const telegramInstanceConfig: Record<string, unknown> = {
      token,
      defaultAgentId,
    };
    if (allowedChatIds.length > 0) {
      telegramInstanceConfig.allowedChatIds = allowedChatIds;
    }
    raw.telegram = {
      ...telegramRaw,
      instances: {
        ...existingInstances,
        [instanceId]: telegramInstanceConfig,
      },
    };
    writeRawConfig(workspace, raw);
    console.log(
      `Config written to ${createWorkspacePaths(workspace).primaryConfigPath}`,
    );

    // Step 7: Next steps
    console.log("\nSetup complete! Next steps:");
    const gatewayStatus = checkGatewayStatus();
    if (gatewayStatus === "active") {
      console.log("  shrimpy gateway restart   restart gateway to pick up new config");
    } else {
      console.log("  shrimpy gateway start     start the gateway");
    }
    console.log("  shrimpy channels          check for incoming Telegram messages");
    console.log();
  } finally {
    close();
  }
}
