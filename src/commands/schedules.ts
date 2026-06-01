import { createAppRuntime } from "../app/index.js";
import { timeSince } from "../channels/format.js";
import type { ShrimpyConfig } from "../config/index.js";
import {
  inspectSchedule,
  inspectSchedules,
  type ScheduleAttentionExpectation,
  type ScheduleInspection,
} from "../scheduler/index.js";
import {
  parseCommandArgs,
  requireArg,
  usage as printUsage,
  type CommandHandler,
} from "./framework.js";

const USAGE = `usage: shrimpy schedules [--agent <id>] [--json]
       shrimpy schedules show <schedule-id> [--json]`;

export const cmdSchedules: CommandHandler = async (argv, config) => {
  const action = argv[0];
  if (!action || action.startsWith("-")) {
    return cmdSchedulesList(argv, config, USAGE);
  }
  if (action === "show") {
    return cmdSchedulesShow(argv.slice(1), config, USAGE);
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
      json: { type: "boolean", default: false },
    },
    strict: true,
    usage,
  });

  const runtime = createAppRuntime(config);
  const schedules = inspectSchedules(runtime, {
    agentId: values.agent,
  });

  if (values.json) {
    console.log(JSON.stringify({ schedules }, null, 2));
    return 0;
  }

  printScheduleList(schedules);
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
  const schedule = inspectSchedule(runtime, scheduleId);

  if (values.json) {
    console.log(JSON.stringify(schedule, null, 2));
    return 0;
  }

  printScheduleDetail(schedule);
  return 0;
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

function printScheduleDetail(schedule: ScheduleInspection): void {
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
    "routing: scheduler writes to target_channel; unaddressed messages go to channel members, then attention filters them into turns",
  );
  console.log(
    `channel_members: ${
      schedule.channelMembership.agentIds.join(",") || "(none)"
    }${schedule.channelMembership.exists ? "" : " (no explicit membership)"}`,
  );
  console.log("expected_attention:");
  if (schedule.expectedAttention.length === 0) {
    console.log("- (none)");
  } else {
    for (const agent of schedule.expectedAttention) {
      console.log(`- ${formatAttentionExpectation(agent)}`);
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
  for (const command of schedule.inspectCommands.attention) {
    console.log(`- ${command}`);
  }
  if (schedule.diagnostics.length > 0) {
    console.log("diagnostics:");
    for (const diagnostic of schedule.diagnostics) {
      console.log(`- ${diagnostic}`);
    }
  }
}

function formatAttentionExpectation(
  expectation: ScheduleAttentionExpectation,
): string {
  const status = expectation.handles ? "handles" : "skips";
  const member = expectation.member ? "member" : "not-member";
  return `${expectation.agentId}: ${status} (${member}) ${expectation.reason} session=${expectation.sessionPath}`;
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
