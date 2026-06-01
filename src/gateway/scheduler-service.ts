import { existsSync } from "node:fs";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  createScheduler,
  drainDueOneTimeSchedules,
  emitChannelTargetRun,
  loadAgentScheduleDefinitions,
  loadOneTimeScheduleStore,
  loadScheduleDefinitions,
  loadSchedulerState,
  resolveAgentScheduleDefinition,
  saveSchedulerState,
  type ScheduleDefinition,
  type Scheduler,
  type ResolvedAgentScheduleDefinition,
} from "../scheduler/index.js";
import { createDefaultShrimpySchedules } from "../setup/defaults.js";
import { writeJsonFileAtomic } from "../util/json-file.js";

export function ensureGatewaySchedulesFile(runtime: AppRuntime): void {
  for (const agent of runtime.resolved.agents) {
    const agentPaths = runtime.getAgentPaths(agent.id);
    if (existsSync(agentPaths.schedulesPath)) continue;

    const schedules = agent.id === "shrimpy" ? createDefaultShrimpySchedules() : [];
    writeJsonFileAtomic(agentPaths.schedulesPath, schedules);
    console.log(
      `[gateway] initialized schedules file for ${agent.id} at ${agentPaths.schedulesPath}`,
    );
  }

  if (!existsSync(runtime.paths.systemSchedulesPath)) {
    writeJsonFileAtomic(runtime.paths.systemSchedulesPath, []);
    console.log(
      `[gateway] initialized system schedules file at ${runtime.paths.systemSchedulesPath}`,
    );
  }
}

export function loadGatewayAgentSchedules(
  runtime: AppRuntime,
): ResolvedAgentScheduleDefinition[] {
  const schedules: ResolvedAgentScheduleDefinition[] = [];
  const seen = new Set<string>();

  for (const agent of runtime.resolved.agents) {
    const path = runtime.getAgentPaths(agent.id).schedulesPath;
    const agentSchedules = loadAgentScheduleDefinitions(path);
    for (const schedule of agentSchedules) {
      const resolved = resolveAgentScheduleDefinition(agent.id, schedule);
      if (seen.has(resolved.id)) {
        throw new Error(`duplicate resolved schedule id: ${resolved.id}`);
      }
      seen.add(resolved.id);
      schedules.push(resolved);
    }
  }

  return schedules;
}

export function loadGatewayScheduleIds(runtime: AppRuntime): string[] {
  const agentSchedules = loadGatewayAgentSchedules(runtime);
  const systemSchedules = loadScheduleDefinitions(runtime.paths.systemSchedulesPath);
  const oneTimeSchedules = loadOneTimeScheduleStore(runtime.paths.oneTimeSchedulesPath);
  return [
    ...agentSchedules.map((schedule) => schedule.id),
    ...systemSchedules.map((schedule) => schedule.id),
    ...oneTimeSchedules.records.map((schedule) => schedule.id),
  ];
}

export function startGatewayScheduler(
  runtime: AppRuntime,
  channelBus: ChannelBus,
): Scheduler {
  const agentSchedules = loadGatewayAgentSchedules(runtime);
  if (agentSchedules.length === 0) {
    throw new Error(
      "no agent schedules configured; add at least one agents/<id>/schedules.json entry",
    );
  }
  const systemSchedules = loadScheduleDefinitions(runtime.paths.systemSchedulesPath);
  const schedules: ScheduleDefinition[] = [...agentSchedules, ...systemSchedules];
  console.log(
    `[gateway] loaded ${agentSchedules.length} agent schedule(s) and ${systemSchedules.length} system schedule(s)`,
  );

  const scheduler = createScheduler({
    schedules,
    tickIntervalMs: runtime.config.scheduler?.tickIntervalMs,
    defaultTimezone: runtime.config.scheduler?.defaultTimezone,
    initialState: loadSchedulerState(runtime.paths.schedulerStatePath),
    onStateChange: (state) => {
      saveSchedulerState(runtime.paths.schedulerStatePath, state);
    },
    onRunDue: async (run) => {
      emitChannelTargetRun(channelBus, run);
    },
    onTick: async (nowMs) => {
      drainDueOneTimeSchedules({
        storePath: runtime.paths.oneTimeSchedulesPath,
        channelBus,
        nowMs,
      });
    },
  });
  scheduler.start();
  return scheduler;
}
