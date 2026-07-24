import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { createWorkspacePaths } from "../../workspace/paths.js";
import {
  editConfigFile,
  readConfigFile,
} from "../../config/store.js";
import {
  telegramChannelDisplayExample,
  validateTelegramInstanceId,
} from "./module.js";
import {
  TelegramBotApiClient,
  type TelegramUpdate,
} from "./client.js";
import { readGatewayServiceStatus } from "../../gateway/service/index.js";
import { brand, heading } from "../../util/style.js";

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

interface TelegramChatCandidate {
  chatId: number;
  chatType: string;
  fromUserId?: number;
  firstName?: string;
  username?: string;
}

function extractTelegramChatCandidates(
  updates: TelegramUpdate[],
): TelegramChatCandidate[] {
  const candidates = new Map<number, TelegramChatCandidate>();
  for (const update of updates) {
    const msg = update.message;
    if (!msg) continue;
    candidates.set(msg.chat.id, {
      chatId: msg.chat.id,
      chatType: msg.chat.type,
      fromUserId: msg.from?.id,
      firstName: msg.from?.first_name,
      username: msg.from?.username,
    });
  }
  return [...candidates.values()].sort((left, right) => left.chatId - right.chatId);
}

function formatTelegramChatCandidate(candidate: TelegramChatCandidate): string {
  const user = candidate.username
    ? `@${candidate.username}`
    : candidate.firstName;
  return [
    `${candidate.chatId}`,
    `chat=${candidate.chatType}`,
    candidate.fromUserId === undefined ? undefined : `from=${candidate.fromUserId}`,
    user,
  ].filter(Boolean).join(" ");
}

async function pollTelegramChatCandidates(
  token: string,
): Promise<TelegramChatCandidate[]> {
  const client = new TelegramBotApiClient(
    { token },
    { policy: { sendMaxRetries: 0, pollTimeoutSec: 5 } },
  );
  const deadline = Date.now() + 60_000;
  let offset = 0;

  while (Date.now() < deadline) {
    const remainingSec = Math.max(1, Math.min(5, Math.ceil((deadline - Date.now()) / 1000)));
    const updates = await client.getUpdates(
      offset,
      remainingSec,
      new AbortController().signal,
    );
    for (const update of updates) {
      offset = Math.max(offset, update.update_id + 1);
    }
    const candidates = extractTelegramChatCandidates(updates);
    if (candidates.length > 0) {
      await client.getUpdates(offset, 0, new AbortController().signal).catch(() => undefined);
      return candidates;
    }
  }

  return [];
}

async function askForChatIds(
  ask: (question: string) => Promise<string>,
  question: string,
): Promise<number[] | null> {
  const input = await ask(question);
  if (!input) return [];
  const parsed = parseChatIds(input);
  if (parsed !== null) return [...new Set(parsed)];

  console.log("Invalid input: chat IDs must be numbers.");
  const retry = await ask("Enter allowed chat IDs (comma-separated), or Enter to abort: ");
  if (!retry) return [];
  const retryParsed = parseChatIds(retry);
  if (retryParsed === null) {
    console.log("Still invalid.");
    return null;
  }
  return [...new Set(retryParsed)];
}

async function discoverAllowedChatIds(
  token: string,
  ask: (question: string) => Promise<string>,
  confirm: (question: string, defaultYes?: boolean) => Promise<boolean>,
): Promise<number[]> {
  console.log("Send a message to your bot in Telegram now.");
  console.log("Setup will poll Telegram directly for up to 60 seconds without starting the gateway.");
  try {
    const candidates = await pollTelegramChatCandidates(token);
    if (candidates.length === 0) {
      console.log("No Telegram messages were seen.");
      return await askForChatIds(
        ask,
        "Enter allowed chat IDs manually, or Enter to abort: ",
      ) ?? [];
    }

    console.log("Candidate chat IDs:");
    for (const candidate of candidates) {
      console.log(`  ${formatTelegramChatCandidate(candidate)}`);
    }

    if (
      candidates.length === 1 &&
      await confirm(`Use chat ID ${candidates[0].chatId}?`)
    ) {
      return [candidates[0].chatId];
    }

    return await askForChatIds(
      ask,
      "Enter allowed chat IDs from the candidates (comma-separated): ",
    ) ?? [];
  } catch (err) {
    console.log(`Telegram polling failed: ${(err as Error).message}`);
    return await askForChatIds(
      ask,
      "Enter allowed chat IDs manually, or Enter to abort: ",
    ) ?? [];
  }
}

function checkGatewayStatus(): "active" | "inactive" {
  if (readGatewayServiceStatus().active === "active") return "active";
  return "inactive";
}

function readRawConfig(workspace: string): Record<string, unknown> | null {
  try {
    return readConfigFile(workspace).raw;
  } catch {
    return null;
  }
}

function writeRawConfig(
  workspace: string,
  nextRaw: Record<string, unknown>,
  opts?: { overwriteInvalid?: boolean },
): void {
  editConfigFile(workspace, (raw) => {
    for (const key of Object.keys(raw)) delete raw[key];
    Object.assign(raw, nextRaw);
  }, opts?.overwriteInvalid ? { baseRaw: {} } : {});
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

    let overwriteInvalid = false;
    let raw = readRawConfig(workspace);
    if (raw === null) {
      console.log(
        `Warning: ${createWorkspacePaths(workspace).primaryConfigPath} exists but is not valid JSON.`,
      );
      if (await confirm("Overwrite it?", false)) {
        raw = {};
        overwriteInvalid = true;
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

    console.log("Allowed chat IDs are required. The gateway will ignore every Telegram chat except IDs in allowedChatIds.");
    console.log(`Telegram surface channels look like ${telegramChannelDisplayExample(instanceId)}.`);
    console.log();

    if (existing?.allowedChatIds?.length) {
      console.log(`Existing allowed IDs: ${existing.allowedChatIds.join(", ")}`);
      if (await confirm("Keep existing IDs?")) {
        allowedChatIds = [...existing.allowedChatIds];
      }
    }

    if (
      allowedChatIds.length === 0 ||
      await confirm("Add another allowed chat ID?", false)
    ) {
      const entered = await askForChatIds(
        ask,
        "Enter allowed chat IDs (comma-separated), or Enter to discover with Telegram: ",
      );
      const discovered = entered?.length === 0
        ? await discoverAllowedChatIds(token, ask, confirm)
        : entered ?? [];
      allowedChatIds = [...new Set([...allowedChatIds, ...discovered])];
    }

    if (allowedChatIds.length === 0) {
      console.log("\nNo allowed chat IDs configured. Telegram setup aborted without writing an enabled instance.");
      return;
    }
    console.log();

    const telegramInstanceConfig: Record<string, unknown> = {
      token,
      defaultAgentId,
      allowedChatIds,
    };
    raw.telegram = {
      ...telegramRaw,
      instances: {
        ...existingInstances,
        [instanceId]: telegramInstanceConfig,
      },
    };
    writeRawConfig(workspace, raw, { overwriteInvalid });
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
