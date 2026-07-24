import type { ChannelMessage } from "../../channels/protocol.js";
import {
  collectChannelActivity,
  loadChannelWatchClockSummary,
} from "../../channels/activity.js";
import { loadRuntimeWatchIds } from "../../watches/agent-runtime.js";
import { channelMatches } from "../../util/channel-pattern.js";
import { formatAgeShort } from "../../util/time-format.js";
import { clipOneLine } from "../../util/text.js";
import {
  producerMatchesChannel,
  runContextTurnProducer,
} from "./producer.js";
import { buildTurnFactItems } from "./facts.js";
import { buildAgentWatchItems } from "./agent-watches.js";
import { buildSessionStatusItems } from "./session-status.js";
import { buildWorkerContextItems } from "./workers.js";
import { buildKnowledgeBreadcrumbItems } from "./knowledge.js";
import {
  contextTurnProducerStateKey,
  readContextState,
  writeContextState,
} from "./state.js";
import { renderUnsupportedSurfaceMessage } from "./surface.js";
import { formatAgentCurrentTime } from "../../util/time-format.js";
import type {
  TurnContextItem,
  TurnContext,
  TurnContextInput,
  TurnProducerReport,
} from "./types.js";
import { sessionChannel } from "../../sessions/spec.js";

function contextAgentId(input: TurnContextInput): string {
  return input.descriptor.key.agentId;
}

export async function buildTurnContext(
  input: TurnContextInput,
): Promise<TurnContext> {
  const agentId = contextAgentId(input);
  const channel = sessionChannel(input.descriptor);
  const sessionType = input.descriptor.purpose;
  const capturedAt = formatAgentCurrentTime();
  const [produced, knowledgeItems] = await Promise.all([
    buildProducerContext(input),
    buildKnowledgeBreadcrumbItems(input),
  ]);
  const items = [
    ...buildTurnFactItems({
      runtime: input.runtime,
      descriptor: input.descriptor,
      agentId,
      currentMessage: input.currentMessage,
    }),
    ...knowledgeItems,
    ...buildGatewayStatusItems(input),
    ...buildAgentWatchItems({ turn: input, agentId }),
    ...buildSessionStatusItems({ turn: input, agentId }),
    ...buildWorkerContextItems({ turn: input, agentId }),
    ...buildChannelUnreadItems(input),
    ...produced.items,
  ];

  return {
    agentId,
    channel,
    sessionType,
    capturedAt,
    maxChars: input.runtime.resolved.context.turn.maxChars,
    items,
    producers: produced.reports,
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
  const channel = sessionChannel(input.descriptor);
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

async function buildProducerContext(input: TurnContextInput): Promise<{
  items: TurnContextItem[];
  reports: TurnProducerReport[];
}> {
  const channel = sessionChannel(input.descriptor);
  const agentId = contextAgentId(input);
  const producers = input.runtime.resolved.context.turn.producers;
  if (producers.length === 0) return { items: [], reports: [] };

  const state = readContextState(input.runtime, agentId);
  const results = await Promise.all(producers.map(async (producer) => {
    const matched = producerMatchesChannel(producer, channel);
    if (!matched) {
      return {
        items: [],
        report: {
          id: producer.id,
          matched: false,
          status: "skipped",
          reason: channel
            ? `channel "${channel}" did not match when.channels`
            : "channel-scoped producer does not match a channel-less session",
        } satisfies TurnProducerReport,
      };
    }
    if (input.preview) {
      return {
        items: [],
        report: {
          id: producer.id,
          matched: true,
          status: "skipped",
          reason: "preview does not execute automatic producers",
        } satisfies TurnProducerReport,
      };
    }

    const stateKey = contextTurnProducerStateKey(
      producer.id,
      channel,
      input.descriptor.purpose,
    );
    const cached = state.producers[stateKey];
    if (isProducerFresh(cached, producer.cacheMs)) {
      return {
        items: cached.items,
        report: {
          id: producer.id,
          matched: true,
          status: "cached",
        } satisfies TurnProducerReport,
      };
    }
    const result = await runContextTurnProducer(producer, {
      workspacePath: input.runtime.paths.workspace,
      agentId,
      channel,
      sessionType: input.descriptor.purpose,
    });
    return {
      items: result.items,
      report: {
        id: producer.id,
        matched: true,
        status: result.error ? "failed" : "ran",
        ...(result.error ? { reason: result.error } : {}),
      } satisfies TurnProducerReport,
      remember: {
        stateKey,
        lastRunAt: Date.now(),
        items: result.items,
      },
    };
  }));

  let stateChanged = false;
  for (const result of results) {
    if (!result.remember) continue;
    state.producers[result.remember.stateKey] = {
      lastRunAt: result.remember.lastRunAt,
      items: result.remember.items,
    };
    stateChanged = true;
  }
  if (stateChanged) writeContextState(input.runtime, agentId, state);

  return {
    items: results.flatMap((result) => result.items),
    reports: results.map((result) => result.report),
  };
}

export function isProducerFresh(
  cached: { lastRunAt?: number; items?: TurnContextItem[] } | undefined,
  cacheMs: number,
): cached is { lastRunAt: number; items: TurnContextItem[] } {
  if (!cached?.lastRunAt || !cached.items) return false;
  return Date.now() - cached.lastRunAt < cacheMs;
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
