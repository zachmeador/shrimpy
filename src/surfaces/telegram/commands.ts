import type { ChannelBus } from "../../channels/bus.js";
import type { MessageOrigin, MessageSender } from "../../channels/protocol.js";
import { formatThinkingInputs } from "../../config/thinking.js";
import {
  executeRemoteCommand,
  listRemoteCommandDefinitions,
  type RemoteCommandContext,
  type RemoteCommandEnvelope,
  type RemoteCommandPermission,
  type RemoteCommandReply,
  type RemoteCommandStatusDetails,
  type RemoteCommandName,
} from "../shared/remote-commands.js";
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
  readStatus(context: RemoteCommandContext):
    | RemoteCommandStatusDetails
    | Promise<RemoteCommandStatusDetails>;
  sendText(chatId: number, text: string): Promise<void>;
}

export interface TelegramCommandContext {
  channel: string;
  chatId: number;
  text: string;
  sender: MessageSender;
  origin: MessageOrigin;
  permission: RemoteCommandPermission;
}

const TELEGRAM_SUPPORTED_COMMANDS: readonly RemoteCommandName[] = [
  "new",
  "clear",
  "stop",
  "thinking",
  "status",
  "help",
];

export function parseTelegramCommandEnvelope(
  text: string,
): RemoteCommandEnvelope | null {
  const trimmed = text.trim();
  const match = /^\/([a-z0-9_]+)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]+))?$/iu.exec(trimmed);
  if (!match?.[1]) return null;
  const rawArgs = match[2]?.trim();
  return {
    name: match[1],
    ...(rawArgs ? { rawArgs } : {}),
  };
}

export function listTelegramMenuCommands(): TelegramMenuCommand[] {
  return listRemoteCommandDefinitions()
    .filter((definition) => TELEGRAM_SUPPORTED_COMMANDS.includes(definition.name))
    .map((definition) => ({
      command: definition.name,
      description: definition.description,
    }));
}

export async function handleTelegramCommand(
  deps: TelegramCommandDeps,
  ctx: TelegramCommandContext,
): Promise<boolean> {
  const envelope = parseTelegramCommandEnvelope(ctx.text);
  if (!envelope) return false;

  const targetAgentId = resolveCurrentAgentId(deps, ctx.chatId);
  const commandContext: RemoteCommandContext = {
    surfaceId: deps.surfaceId,
    threadId: String(ctx.chatId),
    channel: ctx.channel,
    targetAgentId,
    defaultAgentId: deps.defaultAgentId,
    sender: ctx.sender,
    origin: ctx.origin,
    permission: ctx.permission,
    supportedCommands: TELEGRAM_SUPPORTED_COMMANDS,
  };
  const result = await executeRemoteCommand(
    { readStatus: (context) => deps.readStatus(context) },
    commandContext,
    envelope,
  );
  if (result.kind === "control") {
    deps.channelBus.publish(result.message);
    return true;
  }

  await deps.sendText(
    ctx.chatId,
    renderTelegramCommandReply(result.reply, commandContext),
  );
  return true;
}

function resolveCurrentAgentId(
  deps: TelegramCommandDeps,
  chatId: number,
): string {
  return deps.threadStateStore.get(deps.surfaceId, String(chatId)).addressedAgentId
    ?? deps.defaultAgentId;
}

function renderTelegramCommandReply(
  reply: RemoteCommandReply,
  context: RemoteCommandContext,
): string {
  switch (reply.kind) {
    case "unauthorized":
      return "This remote command is not authorized.";

    case "unknown":
      return "Unknown remote command. Use `/help` for available commands.";

    case "usage":
      return [
        reply.detail ? `**Invalid command:** ${reply.detail}` : "**Invalid command arguments**",
        "",
        `Usage: \`${reply.usage}\``,
        ...(reply.command === "thinking"
          ? [`Levels: ${formatThinkingInputs()}`]
          : []),
      ].join("\n");

    case "help":
      return [
        "**Shrimpy Telegram Commands**",
        "",
        ...reply.commands.map((command) =>
          `\`${command.usage}\` ${command.description}.`
        ),
      ].join("\n");

    case "status":
      return renderStatus(context, reply.status);

    case "unavailable":
      return `The \`/${reply.command}\` command is temporarily unavailable.`;
  }
}

function renderStatus(
  context: RemoteCommandContext,
  status: RemoteCommandStatusDetails,
): string {
  const lane = status.lane;
  const sessionState = lane.phase === "running" && lane.queueDepth > 0
    ? `running (${lane.queueDepth} queued)`
    : lane.phase === "queued"
      ? `queued (${lane.queueDepth})`
      : lane.phase.replaceAll("-", " ");
  return [
    "**Shrimpy Remote Status**",
    "",
    `Surface: \`${context.surfaceId}\``,
    `Thread: \`${context.threadId}\``,
    `Channel: \`${context.channel}\``,
    `Current agent: \`${context.targetAgentId}\``,
    `Default agent: \`${context.defaultAgentId}\``,
    `Session: ${sessionState}`,
    ...(status.thinking ? [`Thinking: \`${status.thinking}\``] : []),
    ...(status.model
      ? [`Model: \`${status.model.provider}/${status.model.id}\``]
      : []),
    "",
    "For deeper inspection: `shrimpy status`, `shrimpy gateway status`, or `shrimpy sessions list`.",
  ].join("\n");
}
