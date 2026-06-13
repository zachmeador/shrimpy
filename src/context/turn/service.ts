import type { ChannelMessage } from "../../channels/index.js";
import {
  collectChannelActivity,
  loadChannelWatchClockSummary,
} from "../../channels/activity.js";
import { loadRuntimeWatchIds } from "../../watches/index.js";
import { buildMemoryContext } from "./memory.js";
import { channelMatches } from "../../util/channel-pattern.js";
import { formatAgeShort } from "../../util/time-format.js";
import {
  isCommandSource,
  resolveContextSource,
  type ResolvedContextCommandSource,
} from "../source.js";
import { runContextSourceCommand } from "./command-source.js";
import { buildTurnFactItems } from "./facts.js";
import { buildAgentWatchItems } from "./agent-watches.js";
import { buildSessionStatusItems } from "./session-status.js";
import { buildWorkerContextItems } from "./workers.js";
import {
  readContextState,
  writeContextState,
} from "./state.js";
import { renderUnsupportedSurfaceMessage } from "./surface.js";
import { formatAgentDateTime } from "./time.js";
import type {
  TurnContextItem,
  TurnContext,
  TurnContextInput,
} from "./types.js";

function contextAgentId(input: TurnContextInput): string {
  return input.descriptor.agentId ?? input.runtime.getAgent().id;
}

export async function buildTurnContext(
  input: TurnContextInput,
): Promise<TurnContext> {
  const agentId = contextAgentId(input);
  const channel = input.descriptor.channel;
  const sessionType = input.descriptor.kind;
  const capturedAt = formatAgentDateTime();
  const items = [
    ...buildTurnFactItems({
      runtime: input.runtime,
      descriptor: input.descriptor,
      agentId,
      currentMessage: input.currentMessage,
    }),
    ...buildGatewayStatusItems(input),
    ...buildAgentWatchItems({ turn: input, agentId }),
    ...buildSessionStatusItems({ turn: input, agentId }),
    ...buildWorkerContextItems({ turn: input, agentId }),
    ...buildChannelUnreadItems(input),
    ...await buildCommandItems(input),
  ];

  const memory = buildMemoryContext({
    runtime: input.runtime,
    agentId,
    channel,
    peerIds: input.currentMessage
      ? [input.currentMessage.sender.actorId]
      : [],
  });

  return {
    agentId,
    channel,
    sessionType,
    capturedAt,
    maxChars: input.runtime.resolved.context.turn.maxChars,
    items,
    memory,
  };
}

function buildGatewayStatusItems(input: TurnContextInput): TurnContextItem[] {
  const watchIds = loadRuntimeWatchIds(input.runtime);
  const activity = collectChannelActivity(
    input.runtime.paths.channelsDir,
    input.runtime.resolved.status,
    watchIds,
  );
  const watchClock = loadChannelWatchClockSummary(
    input.runtime.paths.watchClockStatePath,
    input.runtime.resolved.status,
    watchIds,
  );
  const pieces: string[] = [];

  if (activity.lastWatchRun) {
    pieces.push(
      `last watch run ${formatAgeShort(Date.now() - activity.lastWatchRun.message.timestamp)} ago`,
    );
  }
  if (watchClock.nextWatchRun) {
    const delta = watchClock.nextWatchRun.nextRunAtMs - Date.now();
    pieces.push(
      delta >= 0
        ? `next watch run in ${formatAgeShort(delta)}`
        : `next watch run overdue by ${formatAgeShort(Math.abs(delta))}`,
    );
  }
  if (activity.lastUserInteraction) {
    pieces.push(
      `last user interaction in ${activity.lastUserInteraction.channel} ${formatAgeShort(Date.now() - activity.lastUserInteraction.message.timestamp)} ago`,
    );
  }

  if (pieces.length === 0) return [];
  return [{
    id: "gateway:status",
    summary: `gateway status: ${pieces.join("; ")}`,
    inspect: "shrimpy gateway status",
  }];
}

function buildChannelUnreadItems(input: TurnContextInput): TurnContextItem[] {
  const { currentMessage, runtime } = input;
  const agentId = contextAgentId(input);
  const channel = input.descriptor.channel;
  const config = runtime.resolved.context.turn.channelUnread;
  if (!channel || !currentMessage || !config.enabled) return [];
  if (!matchesAny(config.channels, channel)) return [];

  const channelBus = runtime.createChannelBus();
  const { messages } = channelBus.read(channel);
  const currentIndex = messages.findIndex((message) => message.id === currentMessage.id);
  const visibleMessages = currentIndex >= 0
    ? messages.slice(0, currentIndex + 1)
    : [...messages, currentMessage];
  const state = readContextState(runtime, agentId);
  const lastSeenId = state.channels[channel]?.lastSeenMessageId;
  const lastSeenIndex = lastSeenId
    ? visibleMessages.findIndex((message) => message.id === lastSeenId)
    : -1;
  const unseen = lastSeenIndex >= 0
    ? visibleMessages.slice(lastSeenIndex + 1)
    : visibleMessages;

  if (unseen.length <= 1 && unseen[0]?.id === currentMessage.id) return [];
  if (unseen.length === 0) return [];

  const latest = unseen.at(-1);
  const latestPreview = latest && config.includeLatest
    ? `; latest ${senderLabel(latest)} ${formatAgeShort(Date.now() - latest.timestamp)} ago: ${summarizeMessage(latest)}`
    : "";
  const after = lastSeenId ? ` --after ${lastSeenId}` : "";

  return [{
    id: `channels:${channel}:unread`,
    summary: `${channel}: ${unseen.length} new message${unseen.length === 1 ? "" : "s"} since this agent last handled it${latestPreview}`,
    inspect: `shrimpy channels read ${channel}${after}`,
  }];
}

async function buildCommandItems(input: TurnContextInput): Promise<TurnContextItem[]> {
  const channel = input.descriptor.channel;
  const agentId = contextAgentId(input);
  const resolved = input.runtime.resolved.context.sources
    .map(resolveContextSource)
    .filter(isCommandSource);
  const commands = resolved.filter(
    (command) => !channel || matchesAny(command.channels, channel),
  );
  if (commands.length === 0) return [];

  const state = readContextState(input.runtime, agentId);
  const results = await Promise.all(commands.map(async (command) => {
    const cached = state.commands[command.id];
    if (!input.preview && isCommandFresh(cached, command.freshForMs)) {
      return cached.items ?? [];
    }
    const result = await runContextSourceCommand(command, {
      runtime: input.runtime,
      agentId,
      channel,
      sessionType: input.descriptor.kind,
    });
    if (!input.preview) rememberCommandRun(command, input, result.items);
    return result.items;
  }));
  return results.flat();
}

function rememberCommandRun(
  command: ResolvedContextCommandSource,
  input: TurnContextInput,
  items: TurnContextItem[],
): void {
  const agentId = contextAgentId(input);
  const state = readContextState(input.runtime, agentId);
  state.commands[command.id] = {
    lastRunAt: Date.now(),
    items,
  };
  writeContextState(input.runtime, agentId, state);
}

function isCommandFresh(
  cached: { lastRunAt?: number; items?: TurnContextItem[] } | undefined,
  freshForMs: number,
): cached is { lastRunAt: number; items: TurnContextItem[] } {
  if (!cached?.lastRunAt || !cached.items) return false;
  return Date.now() - cached.lastRunAt < freshForMs;
}

function matchesAny(patterns: string[], channel: string): boolean {
  return patterns.some((pattern) => channelMatches(pattern, channel));
}

function senderLabel(message: ChannelMessage): string {
  return message.sender.displayName
    ? `${message.sender.kind}:${message.sender.displayName}`
    : `${message.sender.kind}:${message.sender.actorId}`;
}

function summarizeMessage(message: ChannelMessage): string {
  let text: string;
  switch (message.content.type) {
    case "text":
      text = message.content.data.text;
      break;
    case "system":
    case "control":
    case "status":
      text = JSON.stringify(message.content.data);
      break;
    case "image":
      text = message.content.data.caption ?? "[image]";
      break;
    case "image_group":
      text = message.content.data.caption ??
        `[image_group: ${message.content.data.paths.length} images]`;
      break;
    case "unsupported_media":
      text = renderUnsupportedSurfaceMessage(message.content.data);
      break;
  }
  return clipOneLine(text, 120);
}

function clipOneLine(text: string, max: number): string {
  const oneLine = text.replaceAll(/\s+/g, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max - 3)}...`;
}
