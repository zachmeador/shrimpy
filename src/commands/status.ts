import { existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import { createAppRuntime } from "../app/index.js";
import {
  collectShrimpyRuntimeWarnings,
  shrimpyRuntimeChildEnv,
} from "../app/environment.js";
import { timeSince } from "../channels/format.js";
import { collectChannelActivity } from "../channels/activity.js";
import {
  readDeliveryReceipts,
  summarizeDeliveryReceipts,
} from "../channels/outbox.js";
import { loadRuntimeWatchIds } from "../watches/index.js";
import {
  formatGatewayServiceSummary,
  readGatewayServiceStatus,
} from "../gateway/service-ctl.js";
import { collectGatewayLiveness } from "../gateway/liveness.js";
import {
  loadTelegramOffset,
  telegramStatePath,
  type ResolvedTelegramRuntimeConfig,
} from "../surfaces/telegram/index.js";
import {
  resolveSetupState,
  type SetupState,
} from "../setup/state.js";
import { resolveWorkspacePathInfo } from "../config/workspace.js";
import { inspectWorkspaceCheckpointStatus } from "../workspace-checkpoints/index.js";
import { accent, dim, label } from "../util/style.js";
import { printWorkspaceCheckpointStatus } from "./workspace.js";
import type { CommandHandler } from "./framework.js";

export const cmdStatus: CommandHandler = async (_argv, config) => {
  const workspaceResolution = resolveWorkspacePathInfo();
  const runtime = createAppRuntime(config);
  const channelBus = runtime.createChannelBus();
  const ws = runtime.paths.workspace;
  const receipts = readDeliveryReceipts(runtime.paths.outboundReceiptsPath);
  const undelivered = Object.keys(receipts).reduce(
    (count, channel) => count + summarizeDeliveryReceipts(receipts, channel).undelivered,
    0,
  );
  console.log(`${label("workspace:")} ${ws}`);
  console.log(`${label("workspace source:")} ${formatWorkspaceSource(workspaceResolution, ws)}`);
  console.log(`${label("app checkout:")} ${runtime.environment.appRoot}`);
  console.log(`${label("runtime bin:")} ${runtime.environment.binDir}`);
  const shrimpyCommand = resolveShrimpyCommand(ws);
  console.log(`${label("shrimpy command:")} ${shrimpyCommand}`);
  console.log(`${label("setup:")} ${formatSetupStatus(await resolveSetupState(ws))}`);

  const gatewayStatus = readGatewayServiceStatus({ workspace: ws });
  const gateway = collectGatewayLiveness({
    pidPath: runtime.paths.gatewayPidPath,
    healthPath: runtime.paths.gatewayHealthPath,
    workspace: ws,
    appCheckout: runtime.environment.appRoot,
    service: gatewayStatus,
  });
  console.log(`${label("gateway service id:")} ${gatewayStatus.serviceName}`);
  console.log(`${label("gateway:")} ${gateway.process}${gateway.pid ? ` (PID ${gateway.pid})` : ""}`);
  console.log(`${label("gateway service:")} ${formatGatewayServiceSummary(gatewayStatus)}`);
  console.log(`${label("gateway heartbeat:")} ${gateway.heartbeat}`);
  for (const warning of gateway.warnings) console.log(`${label("gateway warning:")} ${warning}`);
  for (const [surface, health] of Object.entries(gateway.surfaces)) {
    console.log(`${label(`surface ${surface}:`)} ${health.status} failures=${health.consecutiveFailures} stalls=${health.stallRestartCount}`);
    if (health.lastError) console.log(`  ${label("inspect:")} shrimpy gateway status; shrimpy gateway logs`);
  }
  for (const warning of collectShrimpyRuntimeWarnings(runtime.environment, {
    workspaceResolution,
    shrimpyCommandPath: shrimpyCommand === "(not found)" ? undefined : shrimpyCommand,
    gatewayServiceName: gatewayStatus.serviceName,
    currentCliPath: process.argv[1],
  })) {
    console.log(`${label("runtime warning:")} ${warning}`);
  }
  console.log(`${label("undelivered outbound:")} ${undelivered}`);

  printWorkspaceCheckpointStatus(inspectWorkspaceCheckpointStatus(ws));

  const channelsDir = runtime.paths.channelsDir;
  if (existsSync(channelsDir)) {
    const files = readdirSync(channelsDir).filter((f) => f.endsWith(".jsonl"));
    if (files.length === 0) {
      console.log(`${label("channels:")} ${dim("(none)")}`);
    } else {
      console.log(label("channels:"));
      for (const f of files) {
        const name = basename(f, ".jsonl");
        const path = join(channelsDir, f);
        const { messages } = channelBus.read(name);
        const st = statSync(path);
        const age = timeSince(st.mtimeMs);
        console.log(`  ${accent(name)}  ${messages.length} msgs  ${dim(`last write ${age}`)}`);
      }
    }
  } else {
    console.log(`${label("channels:")} ${dim("(none)")}`);
  }

  const activity = collectChannelActivity(
    runtime.paths.channelsDir,
    runtime.resolved.status,
    loadRuntimeWatchIds(runtime),
  );
  if (activity.lastWatchRun) {
    console.log(
      `${label("last watch run:")} ${timeSince(activity.lastWatchRun.message.timestamp)}`,
    );
  }

  const telegram = runtime.surfaceConfig<ResolvedTelegramRuntimeConfig>("telegram");
  for (const instance of telegram.instances) {
    const statePath = telegramStatePath(runtime.paths.workspace, instance.id);
    if (!existsSync(statePath)) continue;
    console.log(
      `${label(`telegram ${instance.id} offset:`)} ${loadTelegramOffset(statePath)}`,
    );
  }

  return 0;
};

function formatWorkspaceSource(
  resolution: ReturnType<typeof resolveWorkspacePathInfo>,
  workspace: string,
): string {
  if (resolution.workspace !== workspace) return "provided config";
  return resolution.sourcePath
    ? `${resolution.source} (${resolution.sourcePath})`
    : resolution.source;
}

function resolveShrimpyCommand(workspace: string): string {
  const result = spawnSync("sh", ["-lc", "command -v shrimpy"], {
    encoding: "utf-8",
    env: shrimpyRuntimeChildEnv(workspace),
  });
  if (result.error || result.status !== 0) return "(not found)";
  return String(result.stdout).trim() || "(not found)";
}

export function formatSetupStatus(state: SetupState): string {
  switch (state.kind) {
    case "uninitialized":
      return "not initialized - run shrimpy setup";
    case "needs_model_access":
      return "needs model access - run shrimpy setup";
    case "needs_coding_policy":
      return "needs coding model policy - run shrimpy setup";
    case "invalid_coding_policy":
      return "invalid coding model policy - run shrimpy setup";
    case "needs_mechanic_workspace":
      return "needs agent workspace - run shrimpy setup";
    case "ready":
      return "ready";
  }
}
