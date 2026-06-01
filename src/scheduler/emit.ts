import type { ChannelBus } from "../channels/bus.js";
import {
  makeMessage,
  type MessageScheduleProvenance,
  type ChannelMessage,
  systemContent,
  textContent,
} from "../channels/index.js";
import { renderScheduledTextRun } from "../context/turn/scheduler.js";
import type { OneTimeScheduleRecord } from "./one-time.js";
import type {
  ResolvedAgentScheduleDefinition,
  ScheduleDefinition,
  ScheduleRunDue,
  ScheduleTrigger,
} from "./schema.js";

export interface OneTimeScheduleRunDue {
  record: OneTimeScheduleRecord;
  runId: string;
  fireTimeMs: number;
  fireTimeIso: string;
}

export function emitChannelTargetRun(
  channelBus: ChannelBus,
  run: ScheduleRunDue,
): boolean {
  const action = run.schedule.action;
  if (action.kind !== "agent") return false;
  if (action.target.kind !== "channel") return false;

  const target = action.target;
  const contentData: Record<string, unknown> = {
    ...(target.contentData ?? {}),
    scheduleId: run.scheduleId,
    runId: run.runId,
    timestamp: run.fireTimeIso,
  };
  const content = target.contentType === "text"
    ? textContent(renderScheduledTextRun(run))
    : systemContent(contentData);

  channelBus.publish({
    channel: target.channel,
    sender: {
      kind: target.senderKind ?? "system",
      actorId: target.senderActorId ?? "system:scheduler",
      userId: target.senderUserId,
      displayName: target.senderDisplayName,
    },
    origin: {
      transport: "scheduler",
      scheduleId: run.scheduleId,
      runId: run.runId,
      sourceChannel: target.channel,
      addressedAgentId: target.addressedAgentId,
      schedule: scheduleProvenance(run.schedule, target.channel),
    },
    content,
  });
  return true;
}

export function emitOneTimeScheduleRun(
  channelBus: ChannelBus,
  run: OneTimeScheduleRunDue,
): ChannelMessage {
  const record = run.record;
  return channelBus.publish({
    channel: record.targetChannel,
    sender: {
      kind: "system",
      actorId: "system:scheduler",
    },
    origin: {
      transport: "scheduler",
      scheduleId: record.id,
      runId: run.runId,
      sourceChannel: record.targetChannel,
      schedule: oneTimeScheduleProvenance(record),
    },
    content: textContent(record.text),
    timestamp: run.fireTimeMs,
  });
}

export function previewOneTimeScheduleMessage(
  record: OneTimeScheduleRecord,
): ChannelMessage {
  return makeMessage({
    id: "one-time-schedule-inspection",
    timestamp: record.dueAtMs,
    sender: {
      kind: "system",
      actorId: "system:scheduler",
    },
    origin: {
      transport: "scheduler",
      scheduleId: record.id,
      runId: "one-time-schedule-inspection",
      sourceChannel: record.targetChannel,
      schedule: oneTimeScheduleProvenance(record),
    },
    content: textContent(record.text),
  });
}

function scheduleProvenance(
  schedule: ScheduleDefinition,
  targetChannel: string,
): MessageScheduleProvenance {
  const resolved = schedule as Partial<ResolvedAgentScheduleDefinition>;
  return {
    kind: "recurring",
    ...(resolved.ownerAgentId ? { ownerAgentId: resolved.ownerAgentId } : {}),
    ...(resolved.localId ? { localId: resolved.localId } : {}),
    targetChannel,
    trigger: triggerMetadata(schedule.trigger, schedule.timezone),
    inspect: [`shrimpy schedules show ${schedule.id}`],
  };
}

function oneTimeScheduleProvenance(
  record: OneTimeScheduleRecord,
): MessageScheduleProvenance {
  return {
    kind: "one_time",
    ...(record.ownerAgentId ? { ownerAgentId: record.ownerAgentId } : {}),
    targetChannel: record.targetChannel,
    trigger: {
      type: "once",
      dueAt: record.dueAtIso,
      dueAtMs: record.dueAtMs,
      ...(record.timezone ? { timezone: record.timezone } : {}),
    },
    source: {
      ...record.source,
    },
    inspect: [`shrimpy schedules show ${record.id}`],
  };
}

function triggerMetadata(
  trigger: ScheduleTrigger,
  timezone?: string,
): Record<string, unknown> {
  if (trigger.type === "every_ms") {
    return {
      type: trigger.type,
      everyMs: trigger.everyMs,
    };
  }

  return {
    type: trigger.type,
    expression: trigger.expression,
    ...(trigger.timezone ?? timezone
      ? { timezone: trigger.timezone ?? timezone }
      : {}),
  };
}
