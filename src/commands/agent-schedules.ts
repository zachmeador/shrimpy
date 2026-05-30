import { createAppRuntime } from "../app/index.js";
import type { ShrimpyConfig } from "../config/index.js";
import { loadAgentScheduleDefinitions } from "../scheduler/index.js";
import { requireArg } from "./framework.js";

export async function cmdAgentSchedules(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  const agentId = requireArg(args[0], usage, "agent id");

  const runtime = createAppRuntime(config);
  const agent = runtime.getAgent(agentId);
  const schedulesPath = runtime.getAgentPaths(agent.id).schedulesPath;
  const schedules = loadAgentScheduleDefinitions(schedulesPath);

  if (json) {
    console.log(JSON.stringify({
      agentId: agent.id,
      path: schedulesPath,
      schedules,
    }, null, 2));
    return 0;
  }

  console.log(`agent: ${agent.id}`);
  console.log(`path: ${schedulesPath}`);
  if (schedules.length === 0) {
    console.log("(no schedules)");
    return 0;
  }

  for (const schedule of schedules) {
    const status = schedule.enabled === false ? "disabled" : "enabled";
    const trigger = schedule.trigger.type === "every_ms"
      ? `every ${schedule.trigger.everyMs}ms`
      : `cron ${schedule.trigger.expression}`;
    console.log(
      `${schedule.id}  ${status}  ${trigger}  channel=${schedule.channel}`,
    );
  }

  return 0;
}

export async function cmdAgentSchedule(
  config: ShrimpyConfig,
  args: string[],
  json: boolean,
  usage: string,
): Promise<number> {
  const agentId = requireArg(args[0], usage, "agent id");
  const scheduleId = requireArg(args[1], usage, "schedule id");

  const runtime = createAppRuntime(config);
  const agent = runtime.getAgent(agentId);
  const schedulesPath = runtime.getAgentPaths(agent.id).schedulesPath;
  const schedule = loadAgentScheduleDefinitions(schedulesPath)
    .find((entry) => entry.id === scheduleId);
  if (!schedule) {
    throw new Error(`schedule not found: ${agent.id}/${scheduleId}`);
  }

  if (json) {
    console.log(JSON.stringify({
      agentId: agent.id,
      path: schedulesPath,
      schedule,
    }, null, 2));
    return 0;
  }

  console.log(`agent: ${agent.id}`);
  console.log(`path: ${schedulesPath}`);
  console.log(JSON.stringify(schedule, null, 2));
  return 0;
}
