import { evaluateAgentChannelPolicy } from "../agents/channel-policy.js";
import type { AppRuntime } from "../app/runtime.js";
import { channelAgentIds } from "../channels/membership.js";
import {
  makeMessage,
  systemContent,
  textContent,
  type ChannelMessage,
} from "../channels/index.js";
import type {
  AgentChannelPolicyRule,
  ResolvedAgentConfig,
} from "../config/agents.js";
import { createGatewaySessionDescriptor } from "../sessions/spec.js";
import {
  loadAgentScheduleDefinitions,
  loadScheduleDefinitions,
  resolveAgentScheduleDefinition,
  type ResolvedAgentScheduleDefinition,
  type ScheduleConcurrencyPolicy,
  type ScheduleDefinition,
  type ScheduleTrigger,
} from "./schema.js";
import { loadSchedulerState } from "./state-store.js";

export type ScheduleSourceKind = "agent" | "system";

export interface ScheduleInspectionSource {
  kind: ScheduleSourceKind;
  path: string;
}

export interface ScheduleInspectionLastRun {
  channel: string;
  messageId: string;
  timestamp: number;
  runId?: string;
}

export interface ScheduleWakeExpectation {
  agentId: string;
  member: boolean;
  action: "wake" | "ignore";
  reason: string;
  policyOwner: "agent";
  effectivePolicy?: Required<AgentChannelPolicyRule>;
  runtimeGuard?: string;
  sessionPath: string;
  inspectCommand: string;
}

export interface ScheduleInspectionCommands {
  schedule: string;
  channel: string;
  membership: string;
  wake: string[];
}

export interface ScheduleInspection {
  id: string;
  name?: string;
  source: ScheduleInspectionSource;
  ownerAgentId?: string;
  localId?: string;
  enabled: boolean;
  trigger: ScheduleTrigger;
  triggerText: string;
  timezone?: string;
  concurrencyPolicy: ScheduleConcurrencyPolicy;
  targetChannel: string;
  addressedAgentId?: string;
  channelMembership: {
    exists: boolean;
    agentIds: string[];
  };
  expectedWake: ScheduleWakeExpectation[];
  expectedTurnAgentIds: string[];
  nextRunAtMs?: number;
  lastObservedRun?: ScheduleInspectionLastRun;
  recentEmittedMessageId?: string;
  inspectCommands: ScheduleInspectionCommands;
  diagnostics: string[];
  schedule: ScheduleDefinition;
}

export interface InspectSchedulesOptions {
  agentId?: string;
}

interface ScheduleInspectionEntry {
  schedule: ScheduleDefinition;
  source: ScheduleInspectionSource;
  ownerAgentId?: string;
  localId?: string;
}

export function inspectSchedules(
  runtime: AppRuntime,
  opts: InspectSchedulesOptions = {},
): ScheduleInspection[] {
  if (opts.agentId) {
    runtime.getAgent(opts.agentId);
  }

  const entries = loadScheduleInspectionEntries(runtime)
    .filter((entry) => !opts.agentId || entry.ownerAgentId === opts.agentId);
  const schedulerState = loadSchedulerState(runtime.paths.schedulerStatePath);
  const channelBus = runtime.createChannelBus();
  const membershipStore = runtime.createChannelMembershipStore();

  return entries.map((entry) => {
    const target = entry.schedule.action.target;
    const membership = membershipStore.get(target.channel);
    const memberAgentIds = membership ? channelAgentIds(membership) : [];
    const expectedWake = inspectExpectedWake(runtime, entry, memberAgentIds);
    const expectedTurnAgentIds = expectedWake
      .filter((agent) => agent.action === "wake")
      .map((agent) => agent.agentId);
    const lastObservedRun = findLastObservedRun(
      channelBus.read(target.channel).messages,
      target.channel,
      entry.schedule.id,
    );
    const diagnostics = scheduleDiagnostics({
      entry,
      membershipExists: membership !== null,
      memberAgentIds,
      expectedTurnAgentIds,
      nextRunAtMs: schedulerState[entry.schedule.id]?.nextRunAtMs,
      lastObservedRun,
    });

    return {
      id: entry.schedule.id,
      ...(entry.schedule.name ? { name: entry.schedule.name } : {}),
      source: entry.source,
      ...(entry.ownerAgentId ? { ownerAgentId: entry.ownerAgentId } : {}),
      ...(entry.localId ? { localId: entry.localId } : {}),
      enabled: entry.schedule.enabled !== false,
      trigger: entry.schedule.trigger,
      triggerText: formatScheduleTrigger(entry.schedule.trigger),
      ...(scheduleTimezone(entry.schedule) ? { timezone: scheduleTimezone(entry.schedule) } : {}),
      concurrencyPolicy: entry.schedule.concurrencyPolicy ?? "forbid",
      targetChannel: target.channel,
      ...(target.addressedAgentId ? { addressedAgentId: target.addressedAgentId } : {}),
      channelMembership: {
        exists: membership !== null,
        agentIds: memberAgentIds,
      },
      expectedWake,
      expectedTurnAgentIds,
      ...(schedulerState[entry.schedule.id]?.nextRunAtMs !== undefined
        ? { nextRunAtMs: schedulerState[entry.schedule.id]?.nextRunAtMs }
        : {}),
      ...(lastObservedRun ? { lastObservedRun } : {}),
      ...(lastObservedRun ? { recentEmittedMessageId: lastObservedRun.messageId } : {}),
      inspectCommands: {
        schedule: `shrimpy schedules show ${entry.schedule.id}`,
        channel: `shrimpy channels show ${target.channel}`,
        membership: `shrimpy channels members ${target.channel}`,
        wake: expectedWake.map((agent) => agent.inspectCommand),
      },
      diagnostics,
      schedule: entry.schedule,
    };
  });
}

export function inspectSchedule(
  runtime: AppRuntime,
  scheduleId: string,
): ScheduleInspection {
  const match = inspectSchedules(runtime).find((schedule) =>
    schedule.id === scheduleId
  );
  if (!match) {
    throw new Error(`schedule not found: ${scheduleId}`);
  }
  return match;
}

function loadScheduleInspectionEntries(
  runtime: AppRuntime,
): ScheduleInspectionEntry[] {
  const entries: ScheduleInspectionEntry[] = [];

  for (const agent of runtime.resolved.agents) {
    const schedulesPath = runtime.getAgentPaths(agent.id).schedulesPath;
    for (const schedule of loadAgentScheduleDefinitions(schedulesPath)) {
      const resolved = resolveAgentScheduleDefinition(agent.id, schedule);
      entries.push({
        schedule: resolved,
        source: {
          kind: "agent",
          path: schedulesPath,
        },
        ownerAgentId: resolved.ownerAgentId,
        localId: resolved.localId,
      });
    }
  }

  for (const schedule of loadScheduleDefinitions(runtime.paths.systemSchedulesPath)) {
    entries.push({
      schedule,
      source: {
        kind: "system",
        path: runtime.paths.systemSchedulesPath,
      },
    });
  }

  return entries;
}

function inspectExpectedWake(
  runtime: AppRuntime,
  entry: ScheduleInspectionEntry,
  memberAgentIds: string[],
): ScheduleWakeExpectation[] {
  const target = entry.schedule.action.target;
  const message = sampleScheduleMessage(entry.schedule);

  return memberAgentIds.flatMap((agentId) => {
    const agent = findAgent(runtime, agentId);
    if (!agent) return [];
    const decision = evaluateAgentChannelPolicy(agent, target.channel, message, {
      visible: true,
    });
    return [{
      agentId: agent.id,
      member: memberAgentIds.includes(agent.id),
      action: decision.action,
      reason: decision.reason,
      policyOwner: decision.policyOwner,
      ...(decision.effectivePolicy ? { effectivePolicy: decision.effectivePolicy } : {}),
      ...(decision.runtimeGuard ? { runtimeGuard: decision.runtimeGuard } : {}),
      sessionPath: createGatewaySessionDescriptor({
        workspacePath: runtime.getAgentPaths(agent.id).root,
        agentId: agent.id,
        channel: target.channel,
      }).sessionDir,
      inspectCommand: wakeInspectCommand(agent.id, target.channel, message),
    }];
  });
}

function sampleScheduleMessage(schedule: ScheduleDefinition): ChannelMessage {
  const target = schedule.action.target;
  const text = typeof target.contentData?.text === "string"
    ? target.contentData.text
    : `[scheduled message ${schedule.id}]`;

  return makeMessage({
    id: "schedule-inspection",
    timestamp: 0,
    sender: {
      kind: target.senderKind ?? "system",
      actorId: target.senderActorId ?? "system:scheduler",
      ...(target.senderUserId ? { userId: target.senderUserId } : {}),
      ...(target.senderDisplayName
        ? { displayName: target.senderDisplayName }
        : {}),
    },
    origin: {
      transport: "scheduler",
      sourceChannel: target.channel,
      scheduleId: schedule.id,
      runId: "schedule-inspection",
      addressedAgentId: target.addressedAgentId,
      schedule: {
        targetChannel: target.channel,
        ...(isResolvedAgentSchedule(schedule)
          ? {
            ownerAgentId: schedule.ownerAgentId,
            localId: schedule.localId,
          }
          : {}),
        trigger: triggerMetadata(schedule.trigger, schedule.timezone),
        inspect: [`shrimpy schedules show ${schedule.id}`],
      },
    },
    content: target.contentType === "text"
      ? textContent(text)
      : systemContent({
        ...(target.contentData ?? {}),
        scheduleId: schedule.id,
        runId: "schedule-inspection",
      }),
  });
}

function findLastObservedRun(
  messages: ChannelMessage[],
  channel: string,
  scheduleId: string,
): ScheduleInspectionLastRun | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || messageScheduleId(message) !== scheduleId) continue;
    return {
      channel,
      messageId: message.id,
      timestamp: message.timestamp,
      ...(messageRunId(message) ? { runId: messageRunId(message) } : {}),
    };
  }
  return undefined;
}

function messageScheduleId(message: ChannelMessage): string | undefined {
  if (message.origin.transport === "scheduler" && message.origin.scheduleId) {
    return message.origin.scheduleId;
  }
  if (
    message.content.type === "system" &&
    typeof message.content.data.scheduleId === "string"
  ) {
    return message.content.data.scheduleId;
  }
  return undefined;
}

function messageRunId(message: ChannelMessage): string | undefined {
  if (message.origin.runId) return message.origin.runId;
  if (
    message.content.type === "system" &&
    typeof message.content.data.runId === "string"
  ) {
    return message.content.data.runId;
  }
  return undefined;
}

function scheduleDiagnostics(input: {
  entry: ScheduleInspectionEntry;
  membershipExists: boolean;
  memberAgentIds: string[];
  expectedTurnAgentIds: string[];
  nextRunAtMs?: number;
  lastObservedRun?: ScheduleInspectionLastRun;
}): string[] {
  const diagnostics: string[] = [];
  const { schedule } = input.entry;
  const target = schedule.action.target;

  if (schedule.enabled === false) {
    diagnostics.push("schedule is disabled");
  }
  if (target.addressedAgentId) {
    if (!input.memberAgentIds.includes(target.addressedAgentId)) {
      diagnostics.push(
        `addressed agent ${target.addressedAgentId} has no visibility into ${target.channel}`,
      );
    }
  }
  if (!target.addressedAgentId && !input.membershipExists) {
    diagnostics.push(`target channel ${target.channel} has no explicit membership`);
  }
  if (!target.addressedAgentId && input.membershipExists && input.memberAgentIds.length === 0) {
    diagnostics.push(`target channel ${target.channel} has no agent members`);
  }
  if (schedule.enabled !== false && input.expectedTurnAgentIds.length === 0) {
    diagnostics.push(
      "no configured agent is expected to take a turn from this scheduled message",
    );
  }
  if (schedule.enabled !== false && input.nextRunAtMs === undefined) {
    diagnostics.push("scheduler state has no next run recorded yet");
  }
  if (!input.lastObservedRun) {
    diagnostics.push("no emitted scheduler message was found in the target channel log");
  }

  return diagnostics;
}

function findAgent(
  runtime: AppRuntime,
  agentId: string,
): ResolvedAgentConfig | undefined {
  try {
    return runtime.getAgent(agentId);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("unknown agent:")) {
      return undefined;
    }
    throw err;
  }
}

export function formatScheduleTrigger(trigger: ScheduleTrigger): string {
  return trigger.type === "every_ms"
    ? `every ${trigger.everyMs}ms`
    : `cron ${trigger.expression}`;
}

function scheduleTimezone(schedule: ScheduleDefinition): string | undefined {
  return schedule.trigger.type === "cron"
    ? schedule.trigger.timezone ?? schedule.timezone
    : schedule.timezone;
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

function wakeInspectCommand(
  agentId: string,
  channel: string,
  message: ChannelMessage,
): string {
  const text = message.content.type === "text"
    ? message.content.data.text
    : JSON.stringify(message.content.data);
  return [
    "shrimpy agent channel-policy explain",
    shellQuote(agentId),
    "--channel",
    shellQuote(channel),
    "--sender",
    message.sender.kind,
    "--actor-id",
    shellQuote(message.sender.actorId),
    message.sender.userId ? `--user-id ${shellQuote(message.sender.userId)}` : "",
    message.origin.addressedAgentId
      ? `--addressed ${shellQuote(message.origin.addressedAgentId)}`
      : "",
    "--text",
    shellQuote(text),
  ].filter(Boolean).join(" ");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function isResolvedAgentSchedule(
  schedule: ScheduleDefinition,
): schedule is ResolvedAgentScheduleDefinition {
  const candidate = schedule as Partial<ResolvedAgentScheduleDefinition>;
  return typeof candidate.ownerAgentId === "string" &&
    typeof candidate.localId === "string";
}
