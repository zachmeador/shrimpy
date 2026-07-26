import {
  statSync,
  watch,
  type FSWatcher,
} from "node:fs";
import { basename, dirname } from "node:path";
import { shrimpyRuntimeChildEnv } from "../app/environment.js";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import { createWatchClock, type WatchClock } from "../watches/clock.js";
import { loadWatchClockState, saveWatchClockState } from "../watches/clock-state.js";
import { loadRuntimeAgentWatchesForAgent } from "../watches/agent-runtime.js";
import {
  createWatchLoadError,
  saveWatchLoadErrors,
  type WatchLoadError,
} from "../watches/load-errors.js";
import { runWatchDue } from "../watches/runner.js";
import type { ResolvedAgentWatchDefinition } from "../watches/schema.js";

export function startGatewayWatchClock(
  runtime: AppRuntime,
  channelBus: ChannelBus,
): WatchClock {
  const watchesByAgent = new Map<string, ResolvedAgentWatchDefinition[]>();
  const loadErrors = new Map<string, WatchLoadError>();
  for (const agent of runtime.resolved.agents) {
    const path = runtime.getAgentPaths(agent.id).watchesPath;
    try {
      watchesByAgent.set(
        agent.id,
        loadRuntimeAgentWatchesForAgent(runtime, agent.id),
      );
    } catch {
      watchesByAgent.set(agent.id, []);
      loadErrors.set(agent.id, createWatchLoadError(agent.id, path));
      logWatchLoadFailure(agent.id, path, "load");
    }
  }
  saveWatchLoadErrors(runtime, loadErrors.values());
  const agentWatches = flattenAgentWatches(runtime, watchesByAgent);
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
        env: shrimpyRuntimeChildEnv(runtime.paths.workspace),
        logger: console,
      });
    },
  });
  const stopWatching = watchAgentWatchFiles(runtime, (agentId, path) => {
    try {
      const nextAgentWatches = loadRuntimeAgentWatchesForAgent(runtime, agentId);
      watchesByAgent.set(agentId, nextAgentWatches);
      loadErrors.delete(agentId);
      const nextWatches = flattenAgentWatches(runtime, watchesByAgent);
      clock.setWatches(nextWatches);
      saveWatchLoadErrors(runtime, loadErrors.values());
      console.log(
        `[gateway] reloaded ${nextAgentWatches.length} watch(es) for agent ${agentId} from ${path}`,
      );
    } catch {
      loadErrors.set(agentId, createWatchLoadError(agentId, path));
      saveWatchLoadErrors(runtime, loadErrors.values());
      logWatchLoadFailure(agentId, path, "reload");
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
  onChange: (agentId: string, path: string) => void,
): () => void {
  const stops: Array<() => void> = [];

  for (const agent of runtime.resolved.agents) {
    const watchesPath = runtime.getAgentPaths(agent.id).watchesPath;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onChange(agent.id, watchesPath), 100);
      timer.unref();
    };
    let watcher: FSWatcher | undefined;
    let stopPolling: (() => void) | undefined;
    let stopped = false;
    const startPolling = (reloadNow = false) => {
      if (stopped || stopPolling) return;
      stopPolling = pollWatchFile(watchesPath, scheduleReload);
      if (reloadNow) scheduleReload();
    };
    try {
      watcher = watch(
        dirname(watchesPath),
        { persistent: false },
        (_eventType, filename) => {
          if (filename && filename.toString() !== basename(watchesPath)) return;
          scheduleReload();
        },
      );
      watcher.on("error", (err) => {
        console.warn(`[gateway] watch file watcher failed for ${watchesPath}:`, err);
        watcher?.close();
        startPolling(true);
      });
    } catch (err) {
      console.warn(`[gateway] could not watch ${watchesPath}:`, err);
    }
    startPolling();
    stops.push(() => {
      stopped = true;
      if (timer) clearTimeout(timer);
      watcher?.close();
      stopPolling?.();
    });
  }

  return () => {
    for (const stop of stops) stop();
  };
}

function flattenAgentWatches(
  runtime: AppRuntime,
  watchesByAgent: ReadonlyMap<string, ResolvedAgentWatchDefinition[]>,
): ResolvedAgentWatchDefinition[] {
  return runtime.resolved.agents.flatMap((agent) =>
    watchesByAgent.get(agent.id) ?? []
  );
}

function logWatchLoadFailure(
  agentId: string,
  path: string,
  action: "load" | "reload",
): void {
  console.warn(
    `[gateway] watch ${action} failed for agent ${agentId} at ${path}: watch file could not be parsed or validated`,
  );
}

function pollWatchFile(
  path: string,
  onChange: () => void,
): () => void {
  let lastStamp = fileStamp(path);
  const interval = setInterval(() => {
    const nextStamp = fileStamp(path);
    if (nextStamp === lastStamp) return;
    lastStamp = nextStamp;
    onChange();
  }, 250);
  interval.unref();
  return () => clearInterval(interval);
}

function fileStamp(path: string): string {
  try {
    const stat = statSync(path);
    return `${stat.mtimeMs}:${stat.size}`;
  } catch {
    return "missing";
  }
}
