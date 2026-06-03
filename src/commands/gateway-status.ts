import { spawnSync } from "node:child_process";
import { createAppRuntime } from "../app/index.js";
import { timeSince } from "../channels/format.js";
import {
  collectGatewayActivity,
  loadGatewayWatchClockSummary,
} from "../gateway/status.js";
import { loadGatewayWatchIds } from "../gateway/watch-service.js";
import { dim, label } from "../util/style.js";
import { formatFutureOrPast } from "../util/time-format.js";

const SERVICE_NAME = "shrimpy-gateway";

export function printGatewayStatus(config: Parameters<typeof createAppRuntime>[0]): void {
  const runtime = createAppRuntime(config);
  const watchIds = loadGatewayWatchIds(runtime);
  const activity = collectGatewayActivity(
    runtime.paths.channelsDir,
    runtime.resolved.status,
    watchIds,
  );
  const watchClock = loadGatewayWatchClockSummary(
    runtime.paths.watchClockStatePath,
    runtime.resolved.status,
    watchIds,
  );

  console.log(`${label("workspace:")} ${runtime.paths.workspace}`);
  console.log(`${label("gateway service:")} ${systemctlStatus("is-active")}`);
  console.log(`${label("gateway enabled:")} ${systemctlStatus("is-enabled")}`);
  console.log(`${label("tracked channels:")} ${activity.channelCount}`);

  if (activity.lastWatchRun) {
    console.log(
      `${label("time since last watch run:")} ${when(activity.lastWatchRun.message.timestamp)}`,
    );
  } else {
    console.log(`${label("time since last watch run:")} ${dim("(none)")}`);
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

  if (watchClock.nextWatchRun) {
    console.log(
      `${label("next watch run due:")} ${formatFutureOrPast(watchClock.nextWatchRun.nextRunAtMs)} ${dim(`(${new Date(watchClock.nextWatchRun.nextRunAtMs).toLocaleString()})`)}`,
    );
  } else {
    console.log(`${label("next watch run due:")} ${dim("(unknown)")}`);
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

function when(ms: number): string {
  return `${timeSince(ms)} ${dim(`(${new Date(ms).toLocaleString()})`)}`;
}
