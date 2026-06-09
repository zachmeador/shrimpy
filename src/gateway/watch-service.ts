import {
  existsSync,
  watch,
  type FSWatcher,
} from "node:fs";
import { basename, dirname } from "node:path";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  createWatchClock,
  loadWatchClockState,
  loadRuntimeAgentWatches,
  runWatchDue,
  saveWatchClockState,
  type WatchClock,
} from "../watches/index.js";
import { createDefaultShrimpyWatches } from "../setup/defaults.js";
import { writeJsonFileAtomic } from "../util/json-file.js";

export function ensureGatewayWatchFiles(runtime: AppRuntime): void {
  for (const agent of runtime.resolved.agents) {
    const agentPaths = runtime.getAgentPaths(agent.id);
    if (existsSync(agentPaths.watchesPath)) continue;

    const watches = agent.id === "shrimpy" ? createDefaultShrimpyWatches() : [];
    writeJsonFileAtomic(agentPaths.watchesPath, watches);
    console.log(
      `[gateway] initialized watches file for ${agent.id} at ${agentPaths.watchesPath}`,
    );
  }
}

export function startGatewayWatchClock(
  runtime: AppRuntime,
  channelBus: ChannelBus,
): WatchClock {
  const agentWatches = loadRuntimeAgentWatches(runtime);
  console.log(
    `[gateway] loaded ${agentWatches.length} agent watch(es)`,
  );

  const clock = createWatchClock({
    watches: agentWatches,
    tickIntervalMs: runtime.config.watchClock?.tickIntervalMs,
    defaultTimezone: runtime.config.watchClock?.defaultTimezone,
    initialState: loadWatchClockState(runtime.paths.watchClockStatePath),
    onStateChange: (state) => {
      saveWatchClockState(runtime.paths.watchClockStatePath, state);
    },
    onRunDue: async (run) => {
      await runWatchDue({
        run,
        channelBus,
        runStoreRoot: runtime.paths.runtimeWatchesDir,
        logger: console,
      });
    },
  });
  const stopWatching = watchAgentWatchFiles(runtime, () => {
    try {
      const nextWatches = loadRuntimeAgentWatches(runtime);
      clock.setWatches(nextWatches);
      console.log(
        `[gateway] reloaded ${nextWatches.length} agent watch(es)`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[gateway] watch reload failed: ${message}`);
    }
  });
  const stopClock = clock.stop.bind(clock);
  clock.stop = () => {
    stopWatching();
    stopClock();
  };
  clock.start();
  return clock;
}

function watchAgentWatchFiles(
  runtime: AppRuntime,
  onChange: () => void,
): () => void {
  const watchers: FSWatcher[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleReload = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(onChange, 100);
    timer.unref();
  };

  for (const agent of runtime.resolved.agents) {
    const watchesPath = runtime.getAgentPaths(agent.id).watchesPath;
    try {
      const watcher = watch(
        dirname(watchesPath),
        { persistent: false },
        (_eventType, filename) => {
          if (filename && filename.toString() !== basename(watchesPath)) return;
          scheduleReload();
        },
      );
      watcher.on("error", (err) => {
        console.warn(`[gateway] watch file watcher failed for ${watchesPath}:`, err);
      });
      watchers.push(watcher);
    } catch (err) {
      console.warn(`[gateway] could not watch ${watchesPath}:`, err);
    }
  }

  return () => {
    if (timer) clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
}
