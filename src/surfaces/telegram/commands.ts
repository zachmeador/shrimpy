import type { ChannelBus } from "../../channels/bus.js";
import { sessionResetMessageInput, sessionRestoreMessageInput, sessionStopMessageInput, sessionThinkingLevelMessageInput, type MessageOrigin, type MessageSender } from "../../channels/protocol.js";
import {
  formatThinkingInputs,
  parseThinkingLevel,
} from "../../config/thinking.js";
import type { SurfaceThreadStateStore } from "../shared/thread-state-store.js";

export interface TelegramMenuCommand {
  command: string;
  description: string;
}

export interface TelegramCommandDeps {
  channelBus: ChannelBus;
  surfaceId: string;
  defaultAgentId: string;
  threadStateStore: SurfaceThreadStateStore;
  sendText(chatId: number, text: string): Promise<void>;
}

export interface TelegramCommandContext {
  channel: string;
  chatId: number;
  text: string;
  sender: MessageSender;
  origin: MessageOrigin;
}

type TelegramCommandName =
  | "new"
  | "clear"
  | "restore"
  | "stop"
  | "thinking"
  | "status"
  | "help";

type ParsedTelegramCommand = {
  name: TelegramCommandName;
  args?: string;
};

const TELEGRAM_MENU_COMMANDS: TelegramMenuCommand[] = [
  { command: "new", description: "Start a fresh session for the current agent" },
  { command: "clear", description: "Alias for /new" },
  { command: "restore", description: "Restore the latest archived session" },
  { command: "stop", description: "Stop the running turn" },
  { command: "thinking", description: "Set session thinking level" },
  { command: "status", description: "Show Telegram chat status" },
  { command: "help", description: "Show Telegram command help" },
];

function parseTelegramCommand(text: string): ParsedTelegramCommand | null {
  const trimmed = text.trim();
  const match = /^\/([a-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]+))?$/i.exec(trimmed);
  if (!match) return null;

  const name = match[1]?.toLowerCase();
  if (
    name !== "new" &&
    name !== "clear" &&
    name !== "restore" &&
    name !== "stop" &&
    name !== "thinking" &&
    name !== "status" &&
    name !== "help"
  ) {
    return null;
  }

  const args = match[2]?.trim();
  return { name, ...(args ? { args } : {}) };
}

function resolveCurrentAgentId(
  deps: TelegramCommandDeps,
  chatId: number,
): string {
  return deps.threadStateStore.get(deps.surfaceId, String(chatId)).addressedAgentId
    ?? deps.defaultAgentId;
}

function buildHelpText(deps: TelegramCommandDeps, chatId: number, channel: string): string {
  const currentAgent = resolveCurrentAgentId(deps, chatId);
  return [
    "**Shrimpy Telegram Commands**",
    "",
    `Current agent: \`${currentAgent}\``,
    `Channel: \`${channel}\``,
    "",
    "`/new` start a fresh session for the current agent.",
    "`/clear` alias for `/new`.",
    "`/restore [archive]` restore the latest or a named archived session.",
    "`/stop` stop the running turn for the current agent.",
    `\`/thinking <level>\` set session thinking: ${formatThinkingInputs()}.`,
    "`/status` show chat routing status.",
    "`/help` show this help message.",
  ].join("\n");
}

function buildStatusText(deps: TelegramCommandDeps, ctx: TelegramCommandContext): string {
  const currentAgent = resolveCurrentAgentId(deps, ctx.chatId);
  return [
    "**Shrimpy Telegram Status**",
    "",
    `Current agent: \`${currentAgent}\``,
    `Default agent: \`${deps.defaultAgentId}\``,
    `Channel: \`${ctx.channel}\``,
    `Chat id: \`${ctx.chatId}\``,
    "",
    "Use `/help` for the full command list.",
  ].join("\n");
}

export function listTelegramMenuCommands(): TelegramMenuCommand[] {
  return [...TELEGRAM_MENU_COMMANDS];
}

export async function handleTelegramCommand(
  deps: TelegramCommandDeps,
  ctx: TelegramCommandContext,
): Promise<boolean> {
  const parsed = parseTelegramCommand(ctx.text);
  if (!parsed) return false;

  switch (parsed.name) {
    case "new":
    case "clear":
      deps.channelBus.publish(sessionResetMessageInput({
        channel: ctx.channel,
        targetAgentId: resolveCurrentAgentId(deps, ctx.chatId),
        sender: ctx.sender,
        origin: {
          ...ctx.origin,
          sourceChannel: ctx.channel,
        },
        command: `/${parsed.name}`,
      }));
      return true;

    case "restore":
      deps.channelBus.publish(sessionRestoreMessageInput({
        channel: ctx.channel,
        targetAgentId: resolveCurrentAgentId(deps, ctx.chatId),
        archiveName: parsed.args,
        sender: ctx.sender,
        origin: {
          ...ctx.origin,
          sourceChannel: ctx.channel,
        },
        command: "/restore",
      }));
      return true;

    case "stop":
      deps.channelBus.publish(sessionStopMessageInput({
        channel: ctx.channel,
        targetAgentId: resolveCurrentAgentId(deps, ctx.chatId),
        sender: ctx.sender,
        origin: {
          ...ctx.origin,
          sourceChannel: ctx.channel,
        },
        command: "/stop",
      }));
      return true;

    case "thinking": {
      const requested = parsed.args?.split(/\s+/, 1)[0]?.trim();
      if (!requested) {
        await deps.sendText(
          ctx.chatId,
          [
            "**Shrimpy Thinking**",
            "",
            `Current agent: \`${resolveCurrentAgentId(deps, ctx.chatId)}\``,
            `Usage: \`/thinking <level>\``,
            `Levels: ${formatThinkingInputs()}`,
          ].join("\n"),
        );
        return true;
      }

      const level = parseThinkingLevel(requested);
      if (!level) {
        await deps.sendText(
          ctx.chatId,
          [
            `**Invalid thinking level:** \`${requested}\``,
            "",
            `Levels: ${formatThinkingInputs()}`,
          ].join("\n"),
        );
        return true;
      }

      deps.channelBus.publish(sessionThinkingLevelMessageInput({
        channel: ctx.channel,
        targetAgentId: resolveCurrentAgentId(deps, ctx.chatId),
        level,
        sender: ctx.sender,
        origin: {
          ...ctx.origin,
          sourceChannel: ctx.channel,
        },
        command: "/thinking",
      }));
      return true;
    }

    case "status":
      await deps.sendText(ctx.chatId, buildStatusText(deps, ctx));
      return true;

    case "help":
      await deps.sendText(ctx.chatId, buildHelpText(deps, ctx.chatId, ctx.channel));
      return true;

    default:
      return false;
  }
}
