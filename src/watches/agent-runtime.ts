import type { AppRuntime } from "../app/runtime.js";
import {
  loadAgentWatchDefinitions,
  resolveAgentWatchDefinition,
  type ResolvedAgentWatchDefinition,
} from "./schema.js";

export function loadRuntimeAgentWatches(
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

export function loadRuntimeWatchIds(runtime: AppRuntime): string[] {
  return loadRuntimeAgentWatches(runtime).map((watch) => watch.id);
}
