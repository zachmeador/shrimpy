import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { createAppRuntime } from "../app/index.js";
import { timeSince } from "../channels/format.js";
import { collectGatewayActivity } from "../gateway/status.js";
import { loadGatewayScheduleIds } from "../gateway/scheduler-service.js";
import {
  loadTelegramOffset,
  telegramStatePath,
  type ResolvedTelegramRuntimeConfig,
} from "../surfaces/telegram/index.js";
import { accent, dim, label } from "../util/style.js";
import type { CommandHandler } from "./framework.js";

function activeStatus(serviceName: string): string | null {
  try {
    return execFileSync(
      "systemctl",
      ["--user", "is-active", serviceName],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch {
    return null;
  }
}

export const cmdStatus: CommandHandler = async (_argv, config) => {
  const runtime = createAppRuntime(config);
  const channelBus = runtime.createChannelBus();
  const ws = runtime.paths.workspace;
  console.log(`${label("workspace:")} ${ws}`);

  const gatewayStatus = activeStatus("shrimpy-gateway") ?? "inactive";
  console.log(`${label("gateway:")} ${gatewayStatus}`);

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

  const activity = collectGatewayActivity(
    runtime.paths.channelsDir,
    runtime.resolved.status,
    loadGatewayScheduleIds(runtime),
  );
  if (activity.lastScheduledRun) {
    console.log(
      `${label("last scheduled run:")} ${timeSince(activity.lastScheduledRun.message.timestamp)}`,
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
