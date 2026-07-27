import { createAppRuntime } from "../../app/runtime.js";
import {
  collectShrimpyRuntimeWarnings,
  resolveShrimpyCommand,
} from "../../app/environment.js";
import { timeSince } from "../../channels/format.js";
import {
  collectChannelActivity,
  loadChannelWatchClockSummary,
} from "../../channels/activity.js";
import {
  readDeliveryReceipts,
  summarizeDeliveryReceipts,
} from "../../channels/outbox.js";
import { loadRuntimeWatchIds } from "../../watches/agent-runtime.js";
import {
  readGatewayServiceStatus,
  type GatewayServiceStatus,
} from "../../gateway/service/index.js";
import {
  flattenGatewayLanes,
  gatewayRuntimeStatePath,
  loadGatewayRuntimeState,
} from "../../gateway/runtime-state.js";
import { collectGatewayLiveness } from "../../gateway/liveness.js";
import { formatSessionAge } from "../../sessions/inventory.js";
import { dim, label } from "../../util/style.js";
import { formatFutureOrPast } from "../../util/time-format.js";

export function printGatewayStatus(
  config: Parameters<typeof createAppRuntime>[0],
  service: GatewayServiceStatus = readGatewayServiceStatus({ workspace: config.workspace }),
): void {
  const runtime = createAppRuntime(config);
  const liveness = collectGatewayLiveness({
    pidPath: runtime.paths.gatewayPidPath,
    healthPath: runtime.paths.gatewayHealthPath,
    workspace: runtime.paths.workspace,
    appCheckout: runtime.environment.appRoot,
    service,
  });
  const watchIds = loadRuntimeWatchIds(runtime);
  const activity = collectChannelActivity(
    runtime.paths.channelsDir,
    runtime.resolved.status,
    watchIds,
  );
  const watchClock = loadChannelWatchClockSummary(
    runtime.paths.watchClockStatePath,
    runtime.resolved.status,
    watchIds,
  );
  const gatewayRuntimeState = loadGatewayRuntimeState(
    gatewayRuntimeStatePath(runtime.paths),
  );
  const lanes = flattenGatewayLanes(gatewayRuntimeState);
  const receipts = readDeliveryReceipts(runtime.paths.outboundReceiptsPath);
  const undelivered = Object.keys(receipts).reduce(
    (count, channel) => count + summarizeDeliveryReceipts(receipts, channel).undelivered,
    0,
  );

  console.log(`${label("workspace:")} ${runtime.paths.workspace}`);
  console.log(`${label("app checkout:")} ${runtime.environment.appRoot}`);
  console.log(`${label("runtime bin:")} ${runtime.environment.binDir}`);
  const shrimpyCommand = resolveShrimpyCommand(runtime.paths.workspace);
  console.log(`${label("shrimpy command:")} ${shrimpyCommand}`);
  console.log(`${label("gateway manager:")} ${service.manager}`);
  console.log(`${label("gateway service id:")} ${service.serviceName}`);
  console.log(`${label("gateway service:")} ${service.active}`);
  console.log(`${label("gateway enabled:")} ${service.enabled}`);
  console.log(`${label("gateway process:")} ${liveness.process}${liveness.pid ? ` (PID ${liveness.pid})` : ""}`);
  console.log(`${label("gateway heartbeat:")} ${liveness.heartbeat}`);
  if (liveness.runtime?.web) {
    const web = liveness.runtime.web;
    console.log(
      `${label("web inspector:")} ${web.status} ${web.url}`
      + (web.pid ? ` (PID ${web.pid})` : "")
      + (web.restartCount ? ` restarts=${web.restartCount}` : ""),
    );
    if (web.lastError) console.log(`  ${label("web error:")} ${dim(web.lastError)}`);
  } else {
    console.log(
      `${label("web inspector:")} ${runtime.resolved.web.enabled ? "unreported" : "disabled"}`
      + (runtime.resolved.web.enabled ? ` http://127.0.0.1:${runtime.resolved.web.port}` : ""),
    );
  }
  for (const warning of liveness.warnings) console.log(`${label("gateway warning:")} ${warning}`);
  if (service.definitionPath) {
    console.log(`${label("gateway service file:")} ${service.definitionPath}`);
  }
  console.log(`${label("gateway log:")} ${runtime.paths.gatewayLogPath}`);
  if (service.serviceLogPath) {
    console.log(`${label("gateway service log:")} ${service.serviceLogPath}`);
  }
  for (const warning of collectShrimpyRuntimeWarnings(runtime.environment, {
    shrimpyCommandPath: shrimpyCommand === "(not found)" ? undefined : shrimpyCommand,
    gatewayServiceName: service.serviceName,
    currentCliPath: process.argv[1],
  })) {
    console.log(`${label("runtime warning:")} ${warning}`);
  }
  console.log(`${label("tracked channels:")} ${activity.channelCount}`);
  console.log(`${label("undelivered outbound:")} ${undelivered}`);

  for (const [surface, health] of Object.entries(liveness.surfaces)) {
    console.log(`${label(`surface ${surface}:`)} ${health.status} failures=${health.consecutiveFailures} stalls=${health.stallRestartCount}`
      + (health.lastCompletedPollAt ? ` last poll ${when(health.lastCompletedPollAt)}` : ""));
    if (health.lastError) {
      console.log(`  ${label("surface error:")} ${dim(health.lastError)}`);
      console.log(`  ${label("inspect:")} shrimpy gateway status; shrimpy gateway logs`);
    }
  }

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

  if (lanes.length > 0) {
    console.log(label("gateway lanes:"));
    for (const lane of lanes) {
      const running = lane.currentTurn
        ? `running ${formatSessionAge(Date.now() - lane.currentTurn.startedAt)}`
        : "idle";
      const last = lane.lastOutcome
        ? ` last=${lane.lastOutcome.outcome}${lane.lastOutcome.replyRecovery ? ` reply-recovery=${lane.lastOutcome.replyRecovery}` : ""} ${formatSessionAge(Date.now() - lane.lastOutcome.at)} ago`
        : "";
      console.log(
        `  ${lane.agentId} ${lane.channel}  ${running} queued=${lane.queueDepth}${dim(last)}`,
      );
    }
  }

  if (gatewayRuntimeState.loopGuards.length > 0) {
    const recent = gatewayRuntimeState.loopGuards.slice(-5).reverse();
    console.log(label("loop guard trips:"));
    for (const trip of recent) {
      console.log(
        `  ${trip.agentId} ${trip.channel} ${trip.messageId}  ${when(trip.at)} ${dim(trip.reason)}`,
      );
    }
  }
}

function when(ms: number): string {
  return `${timeSince(ms)} ${dim(`(${new Date(ms).toLocaleString()})`)}`;
}
