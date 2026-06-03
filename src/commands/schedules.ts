import { createAppRuntime } from "../app/index.js";
import { timeSince } from "../channels/format.js";
import type { ShrimpyConfig } from "../config/index.js";
import {
  addOneTimeSchedule,
  cancelOneTimeSchedule,
  inspectSchedule,
  inspectOneTimeSchedule,
  inspectOneTimeSchedules,
  inspectSchedules,
  parseOneTimeDue,
  type OneTimeScheduleInspection,
  type OneTimeScheduleStatus,
  type ScheduleInspection,
  type ScheduleWakeExpectation,
} from "../scheduler/index.js";
import {
  parseCommandArgs,
  requireArg,
  usage as printUsage,
  type CommandHandler,
} from "./framework.js";
import { renderGroupUsage } from "./catalog.js";

const USAGE = renderGroupUsage("schedules");

export const cmdSchedules: CommandHandler = async (argv, config) => {
  const action = argv[0];
  if (!action || action.startsWith("-")) {
    return cmdSchedulesList(argv, config, USAGE);
  }
  if (action === "list") {
    return cmdSchedulesList(argv.slice(1), config, USAGE);
  }
  if (action === "show") {
    return cmdSchedulesShow(argv.slice(1), config, USAGE);
  }
  if (action === "once") {
    return cmdSchedulesOnce(argv.slice(1), config, USAGE);
  }
  if (action === "cancel") {
    return cmdSchedulesCancel(argv.slice(1), config, USAGE);
  }
  printUsage(USAGE, `unknown subcommand: ${action}`);
};

async function cmdSchedulesList(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      agent: { type: "string" },
      "one-time": { type: "boolean", default: false },
      status: { type: "string" },
      json: { type: "boolean", default: false },
    },
    strict: true,
    usage,
  });

  const runtime = createAppRuntime(config);
  const schedules = inspectSchedules(runtime, {
    agentId: values.agent,
  });
  const oneTimeSchedules = inspectOneTimeSchedules(runtime, {
    agentId: values.agent,
    status: parseOneTimeStatus(values.status),
  });

  if (values.json) {
    console.log(JSON.stringify({ schedules, oneTimeSchedules }, null, 2));
    return 0;
  }

  if (values["one-time"]) {
    printOneTimeScheduleList(oneTimeSchedules);
    return 0;
  }

  printScheduleList(schedules);
  if (oneTimeSchedules.length > 0) {
    console.log("");
    console.log("one-time schedules:");
    printOneTimeScheduleList(oneTimeSchedules);
  }
  return 0;
}

async function cmdSchedulesShow(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const scheduleId = requireArg(positionals[0], usage, "schedule id");
  const runtime = createAppRuntime(config);
  const schedule = inspectAnySchedule(runtime, scheduleId);

  if (values.json) {
    console.log(JSON.stringify(schedule, null, 2));
    return 0;
  }

  printScheduleDetail(schedule);
  return 0;
}

async function cmdSchedulesOnce(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
): Promise<number> {
  const { values } = parseCommandArgs({
    args: argv,
    options: {
      at: { type: "string" },
      in: { type: "string" },
      channel: { type: "string" },
      text: { type: "string" },
      agent: { type: "string" },
      timezone: { type: "string" },
      id: { type: "string" },
      json: { type: "boolean", default: false },
    },
    strict: true,
    usage,
  });

  const channel = requireArg(values.channel, usage, "channel");
  const text = requireArg(values.text, usage, "text");
  const runtime = createAppRuntime(config);
  if (values.agent) runtime.getAgent(values.agent);
  const due = parseOneTimeDue({
    at: values.at,
    in: values.in,
  });
  const record = addOneTimeSchedule(runtime.paths.oneTimeSchedulesPath, {
    id: values.id,
    targetChannel: channel,
    text,
    dueAtMs: due.dueAtMs,
    timezone: values.timezone,
    ownerAgentId: values.agent,
    source: {
      kind: "cli",
      ...(values.agent ? { agentId: values.agent } : {}),
    },
  });
  const inspected = inspectOneTimeSchedule(runtime, record.id);

  if (values.json) {
    console.log(JSON.stringify(inspected, null, 2));
    return 0;
  }

  console.log(`created one-time schedule: ${record.id}`);
  console.log(`due: ${record.dueAtIso} (${formatFutureOrPast(record.dueAtMs)})`);
  console.log(`channel: ${record.targetChannel}`);
  console.log(`text: ${record.text}`);
  console.log(`inspect: shrimpy schedules show ${record.id}`);
  console.log(`cancel: shrimpy schedules cancel ${record.id}`);
  return 0;
}

async function cmdSchedulesCancel(
  argv: string[],
  config: ShrimpyConfig,
  usage: string,
): Promise<number> {
  const { values, positionals } = parseCommandArgs({
    args: argv,
    options: {
      json: { type: "boolean", default: false },
      reason: { type: "string" },
    },
    allowPositionals: true,
    strict: true,
    usage,
  });
  const scheduleId = requireArg(positionals[0], usage, "schedule id");
  const runtime = createAppRuntime(config);
  const record = cancelOneTimeSchedule(runtime.paths.oneTimeSchedulesPath, scheduleId, {
    reason: values.reason,
  });
  const inspected = inspectOneTimeSchedule(runtime, record.id);

  if (values.json) {
    console.log(JSON.stringify(inspected, null, 2));
    return 0;
  }

  console.log(`cancelled one-time schedule: ${record.id}`);
  console.log(`status: ${record.status}`);
  console.log(`cancelled_at: ${record.cancelledAtIso}`);
  return 0;
}

type AnyScheduleInspection = ScheduleInspection | OneTimeScheduleInspection;

function inspectAnySchedule(
  runtime: ReturnType<typeof createAppRuntime>,
  scheduleId: string,
): AnyScheduleInspection {
  try {
    return inspectSchedule(runtime, scheduleId);
  } catch (err) {
    if (!(err instanceof Error) || !err.message.startsWith("schedule not found:")) {
      throw err;
    }
  }
  return inspectOneTimeSchedule(runtime, scheduleId);
}

function printScheduleList(schedules: ScheduleInspection[]): void {
  if (schedules.length === 0) {
    console.log("(no schedules)");
    return;
  }

  for (const schedule of schedules) {
    const status = schedule.enabled ? "enabled" : "disabled";
    const turns = schedule.expectedTurnAgentIds.join(",") || "(none)";
    const next = schedule.nextRunAtMs === undefined
      ? "next=unknown"
      : `next=${formatFutureOrPast(schedule.nextRunAtMs)}`;
    const last = schedule.lastObservedRun
      ? `last=${timeSince(schedule.lastObservedRun.timestamp)}`
      : "last=none";
    const issues = schedule.diagnostics.length > 0
      ? ` diagnostics=${schedule.diagnostics.length}`
      : "";
    console.log(
      `${schedule.id}  ${status}  ${schedule.triggerText}  channel=${schedule.targetChannel}  turns=${turns}  ${next}  ${last}${issues}`,
    );
  }
}

function printOneTimeScheduleList(schedules: OneTimeScheduleInspection[]): void {
  if (schedules.length === 0) {
    console.log("(no one-time schedules)");
    return;
  }

  for (const schedule of schedules) {
    const turns = schedule.expectedTurnAgentIds.join(",") || "(none)";
    const due = schedule.status === "pending"
      ? `due=${formatFutureOrPast(schedule.dueAtMs)}`
      : `due=${new Date(schedule.dueAtMs).toISOString()}`;
    const emitted = schedule.emittedChannelMessageId
      ? ` emitted=${schedule.emittedChannelMessageId}`
      : "";
    const issues = schedule.diagnostics.length > 0
      ? ` diagnostics=${schedule.diagnostics.length}`
      : "";
    console.log(
      `${schedule.id}  ${schedule.status}  channel=${schedule.targetChannel}  turns=${turns}  ${due}${emitted}${issues}`,
    );
  }
}

function printScheduleDetail(schedule: AnyScheduleInspection): void {
  if (isOneTimeScheduleInspection(schedule)) {
    printOneTimeScheduleDetail(schedule);
    return;
  }

  console.log(`schedule: ${schedule.id}`);
  if (schedule.name) console.log(`name: ${schedule.name}`);
  console.log(`source: ${schedule.source.kind} ${schedule.source.path}`);
  if (schedule.ownerAgentId) console.log(`owner_agent: ${schedule.ownerAgentId}`);
  if (schedule.localId) console.log(`local_id: ${schedule.localId}`);
  console.log(`enabled: ${schedule.enabled}`);
  console.log(`trigger: ${schedule.triggerText}`);
  if (schedule.timezone) console.log(`timezone: ${schedule.timezone}`);
  console.log(`concurrency: ${schedule.concurrencyPolicy}`);
  console.log(`target_channel: ${schedule.targetChannel}`);
  if (schedule.addressedAgentId) {
    console.log(`addressed_agent: ${schedule.addressedAgentId}`);
  }
  console.log(
    "wake: scheduler writes to target_channel; channel members receive visibility and each agent owns its wake/response policy",
  );
  console.log(
    `channel_members: ${
      schedule.channelMembership.agentIds.join(",") || "(none)"
    }${schedule.channelMembership.exists ? "" : " (no explicit membership)"}`,
  );
  console.log("expected_wake:");
  if (schedule.expectedWake.length === 0) {
    console.log("- (none)");
  } else {
    for (const agent of schedule.expectedWake) {
      console.log(`- ${formatWakeExpectation(agent)}`);
    }
  }
  console.log(
    `next_run: ${schedule.nextRunAtMs === undefined
      ? "(unknown)"
      : `${new Date(schedule.nextRunAtMs).toISOString()} (${formatFutureOrPast(schedule.nextRunAtMs)})`}`,
  );
  console.log(
    `last_run: ${schedule.lastObservedRun
      ? `${new Date(schedule.lastObservedRun.timestamp).toISOString()} ${schedule.lastObservedRun.messageId}`
      : "(none)"}`,
  );
  console.log(
    `recent_message: ${schedule.recentEmittedMessageId ?? "(none)"}`,
  );
  console.log("inspect:");
  console.log(`- ${schedule.inspectCommands.schedule}`);
  console.log(`- ${schedule.inspectCommands.channel}`);
  console.log(`- ${schedule.inspectCommands.membership}`);
  for (const command of schedule.inspectCommands.wake) {
    console.log(`- ${command}`);
  }
  if (schedule.diagnostics.length > 0) {
    console.log("diagnostics:");
    for (const diagnostic of schedule.diagnostics) {
      console.log(`- ${diagnostic}`);
    }
  }
}

function isOneTimeScheduleInspection(
  schedule: AnyScheduleInspection,
): schedule is OneTimeScheduleInspection {
  return (schedule as OneTimeScheduleInspection).kind === "one_time";
}

function printOneTimeScheduleDetail(schedule: OneTimeScheduleInspection): void {
  console.log(`schedule: ${schedule.id}`);
  console.log("kind: one_time");
  console.log(`source: ${schedule.source.kind} ${schedule.source.path}`);
  console.log(`record_source: ${schedule.source.recordSource.kind}`);
  if (schedule.source.recordSource.agentId) {
    console.log(`source_agent: ${schedule.source.recordSource.agentId}`);
  }
  if (schedule.ownerAgentId) console.log(`owner_agent: ${schedule.ownerAgentId}`);
  console.log(`status: ${schedule.status}`);
  console.log(`target_channel: ${schedule.targetChannel}`);
  console.log(`due_at: ${schedule.dueAtIso} (${formatFutureOrPast(schedule.dueAtMs)})`);
  if (schedule.timezone) console.log(`timezone: ${schedule.timezone}`);
  console.log(`created_at: ${new Date(schedule.createdAtMs).toISOString()}`);
  if (schedule.firedAtMs !== undefined) {
    console.log(`fired_at: ${new Date(schedule.firedAtMs).toISOString()}`);
  }
  if (schedule.cancelledAtMs !== undefined) {
    console.log(`cancelled_at: ${new Date(schedule.cancelledAtMs).toISOString()}`);
  }
  if (schedule.failedAtMs !== undefined) {
    console.log(`failed_at: ${new Date(schedule.failedAtMs).toISOString()}`);
  }
  if (schedule.runId) console.log(`run_id: ${schedule.runId}`);
  console.log(`emitted_message: ${schedule.emittedChannelMessageId ?? "(none)"}`);
  console.log(`text: ${schedule.text}`);
  console.log(
    "wake: scheduler writes to target_channel; channel members receive visibility and each agent owns its wake/response policy",
  );
  console.log(
    `channel_members: ${
      schedule.channelMembership.agentIds.join(",") || "(none)"
    }${schedule.channelMembership.exists ? "" : " (no explicit membership)"}`,
  );
  console.log("expected_wake:");
  if (schedule.expectedWake.length === 0) {
    console.log("- (none)");
  } else {
    for (const agent of schedule.expectedWake) {
      console.log(`- ${formatWakeExpectation(agent)}`);
    }
  }
  console.log("inspect:");
  console.log(`- ${schedule.inspectCommands.schedule}`);
  console.log(`- ${schedule.inspectCommands.channel}`);
  console.log(`- ${schedule.inspectCommands.membership}`);
  if (schedule.inspectCommands.cancel) {
    console.log(`- ${schedule.inspectCommands.cancel}`);
  }
  for (const command of schedule.inspectCommands.wake) {
    console.log(`- ${command}`);
  }
  if (schedule.diagnostics.length > 0) {
    console.log("diagnostics:");
    for (const diagnostic of schedule.diagnostics) {
      console.log(`- ${diagnostic}`);
    }
  }
}

function formatWakeExpectation(
  expectation: ScheduleWakeExpectation,
): string {
  const status = expectation.action === "wake" ? "wakes" : "ignores";
  const member = expectation.member ? "member" : "not-member";
  return `${expectation.agentId}: ${status} (${member}) ${expectation.reason} policy_owner=${expectation.policyOwner} session=${expectation.sessionPath}`;
}

function formatFutureOrPast(targetMs: number): string {
  const diffSeconds = Math.floor((targetMs - Date.now()) / 1000);
  const absSeconds = Math.abs(diffSeconds);
  const amount = absSeconds < 60
    ? `${absSeconds}s`
    : absSeconds < 3_600
      ? `${Math.floor(absSeconds / 60)}m`
      : absSeconds < 86_400
        ? `${Math.floor(absSeconds / 3_600)}h`
        : `${Math.floor(absSeconds / 86_400)}d`;

  return diffSeconds >= 0 ? `in ${amount}` : `${amount} ago`;
}

function parseOneTimeStatus(
  value: string | undefined,
): OneTimeScheduleStatus | undefined {
  if (!value) return undefined;
  if (
    value === "pending" ||
    value === "fired" ||
    value === "cancelled" ||
    value === "failed" ||
    value === "expired"
  ) {
    return value;
  }
  throw new Error(
    "status must be one of: pending, fired, cancelled, failed, expired",
  );
}
