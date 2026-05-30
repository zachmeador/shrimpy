import { spawnSync } from "node:child_process";
import { createAppRuntime } from "../app/index.js";
import { timeSince } from "../channels/format.js";
import {
  collectGatewayActivity,
  loadGatewaySchedulerSummary,
} from "../gateway/status.js";
import { dim, label } from "../util/style.js";

const SERVICE_NAME = "shrimpy-gateway";

export function printGatewayStatus(config: Parameters<typeof createAppRuntime>[0]): void {
  const runtime = createAppRuntime(config);
  const activity = collectGatewayActivity(
    runtime.paths.channelsDir,
    runtime.resolved.status,
  );
  const scheduler = loadGatewaySchedulerSummary(
    runtime.paths.schedulerStatePath,
    runtime.resolved.status,
  );

  console.log(`${label("workspace:")} ${runtime.paths.workspace}`);
  console.log(`${label("gateway service:")} ${systemctlStatus("is-active")}`);
  console.log(`${label("gateway enabled:")} ${systemctlStatus("is-enabled")}`);
  console.log(`${label("tracked channels:")} ${activity.channelCount}`);

  if (activity.lastHeartbeat) {
    console.log(
      `${label("time since last heartbeat:")} ${when(activity.lastHeartbeat.message.timestamp)}`,
    );
  } else {
    console.log(`${label("time since last heartbeat:")} ${dim("(none)")}`);
  }

  if (activity.lastUserInteraction) {
    const sender = activity.lastUserInteraction.message.sender.displayName
      ? `${activity.lastUserInteraction.message.sender.kind}:${activity.lastUserInteraction.message.sender.displayName}`
      : `${activity.lastUserInteraction.message.sender.kind}:${activity.lastUserInteraction.message.sender.actorId}`;
    console.log(
      `${label("time since last user interaction:")} ${when(activity.lastUserInteraction.message.timestamp)}`,
    );
    console.log(
      `${label("last user interaction source:")} ${activity.lastUserInteraction.channel} ${dim(`(${sender})`)}`,
    );
  } else {
    console.log(`${label("time since last user interaction:")} ${dim("(none)")}`);
  }

  if (scheduler.nextHeartbeatAtMs !== undefined) {
    const nextHeartbeat = scheduler.nextHeartbeatAtMs;
    console.log(
      `${label("next heartbeat due:")} ${formatFutureOrPast(nextHeartbeat)} ${dim(`(${new Date(nextHeartbeat).toLocaleString()})`)}`,
    );
  } else {
    console.log(`${label("next heartbeat due:")} ${dim("(unknown)")}`);
  }
}

function systemctlStatus(kind: "is-active" | "is-enabled"): string {
  const result = spawnSync("systemctl", ["--user", kind, SERVICE_NAME], {
    encoding: "utf-8",
  });

  if (result.error) return "unknown";

  const stdout = result.stdout.trim();
  if (stdout) return stdout;

  return "unknown";
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

function when(ms: number): string {
  return `${timeSince(ms)} ${dim(`(${new Date(ms).toLocaleString()})`)}`;
}
