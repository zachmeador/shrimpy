import { existsSync } from "node:fs";
import type { AppRuntime } from "../app/runtime.js";
import type { ChannelBus } from "../channels/bus.js";
import {
  createWatchClock,
  loadWatchClockState,
  loadAgentWatchDefinitions,
  resolveAgentWatchDefinition,
  runWatchDue,
  saveWatchClockState,
  type WatchClock,
  type ResolvedAgentWatchDefinition,
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

export function loadGatewayAgentWatches(
  runtime: AppRuntime,
): ResolvedAgentWatchDefinition[] {
  const watches: ResolvedAgentWatchDefinition[] = [];
  const seen = new Set<string>();

  for (const agent of runtime.resolved.agents) {
    const path = runtime.getAgentPaths(agent.id).watchesPath;
    const agentWatches = loadAgentWatchDefinitions(path);
    for (const watch of agentWatches) {
      const resolved = resolveAgentWatchDefinition(agent.id, watch);
      if (seen.has(resolved.id)) {
        throw new Error(`duplicate resolved watch id: ${resolved.id}`);
      }
      seen.add(resolved.id);
      watches.push(resolved);
    }
  }

  return watches;
}

export function loadGatewayWatchIds(runtime: AppRuntime): string[] {
  const agentWatches = loadGatewayAgentWatches(runtime);
  return agentWatches.map((watch) => watch.id);
}

export function startGatewayWatchClock(
  runtime: AppRuntime,
  channelBus: ChannelBus,
): WatchClock {
  const agentWatches = loadGatewayAgentWatches(runtime);
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
  clock.start();
  return clock;
}
