import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { createWorkspacePaths } from "../app/index.js";
import {
  telegramChannelDisplayExample,
  validateTelegramInstanceId,
} from "../surfaces/telegram/index.js";
import {
  readJsonFileStrict,
  writeJsonFileAtomic,
} from "../util/json-file.js";
import { brand, heading } from "../util/style.js";

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

export async function setupTelegram(workspace: string): Promise<void> {
  const { ask, confirm, close } = createPrompter();

  try {
    console.log(`\n${brand()} ${heading("setup: telegram")}\n`);
    console.log("To create a Telegram bot:");
    console.log("  1. Open Telegram and message @BotFather");
    console.log("  2. Send /newbot and follow the prompts");
    console.log("  3. Copy the bot token (looks like 123456:ABC-DEF...)");
    console.log();

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
